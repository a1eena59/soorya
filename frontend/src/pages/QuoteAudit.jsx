import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import FileDrop from "../components/FileDrop.jsx";
import GenerationChart from "../components/GenerationChart.jsx";
import { lakh, range, rupees, units } from "../format.js";

const QUOTE_FIELDS = [
  ["system_kw", "System size (kW)"],
  ["panel_count", "Number of panels"],
  ["panel_watt", "Panel watt (Wp)"],
  ["inverter_kw", "Inverter (kW)"],
  ["total_price", "Total price (₹)"],
  ["workmanship_warranty_years", "Workmanship warranty (years)"],
  ["advance_payment_pct", "Advance payment (%)"],
  ["claimed_units_per_month", "Promised units / month"],
  ["claimed_payback_years", "Promised payback (years)"],
];

const VERDICTS = {
  oversized: { icon: "⚠", label: "Oversized", cls: "bg-red-50 border-red-300 text-red-900" },
  overpriced: { icon: "⚠", label: "Overpriced", cls: "bg-red-50 border-red-300 text-red-900" },
  undersized: { icon: "!", label: "Undersized", cls: "bg-amber-50 border-amber-300 text-amber-900" },
  fair: { icon: "✓", label: "Looks fair", cls: "bg-emerald-50 border-emerald-300 text-emerald-900" },
};

const SEVERITY = {
  high: { icon: "▲", label: "Important", cls: "text-red-700" },
  medium: { icon: "●", label: "Check", cls: "text-amber-700" },
  info: { icon: "i", label: "Note", cls: "text-slate-500" },
};

async function upload(path, file) {
  const body = new FormData();
  body.append("file", file);
  return api(path, { method: "POST", body });
}

function NumberField({ label, value, onChange, suffix }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center mt-1">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {suffix && <span className="ml-2 text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

export default function QuoteAudit() {
  const [bill, setBill] = useState(null);
  const [quote, setQuote] = useState(null);
  const [inputs, setInputs] = useState({ yearly_units: null, location: "Kochi", connected_load_kw: null });
  const [locations, setLocations] = useState([]);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => { api("/locations").then(setLocations).catch(() => {}); }, []);

  const applyBill = (b) => {
    setBill(b);
    setInputs((i) => ({ ...i, yearly_units: b.analysis.yearly_units, connected_load_kw: b.analysis.connected_load_kw }));
  };

  const read = async (kind, file) => {
    setError(null);
    setBusy((b) => ({ ...b, [kind]: true }));
    try {
      if (kind === "bill") applyBill(await upload("/audit/bill", file));
      else setQuote(await upload("/audit/quote", file));
    } catch (e) {
      setError(`Could not read the ${kind}: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, [kind]: false }));
    }
  };

  const loadDemo = async (autoCheck = false) => {
    setError(null);
    setBusy({ bill: true, quote: true });
    try {
      const d = await api("/audit/demo");
      applyBill(d.bill);
      setQuote(d.quote);
      if (autoCheck) {
        const demoInputs = { ...inputs, yearly_units: d.bill.analysis.yearly_units,
                             connected_load_kw: d.bill.analysis.connected_load_kw };
        await check(true, d.quote, demoInputs, d.bill);
      }
    } catch (e) {
      setError(`Demo failed: ${e.message}`);
    } finally {
      setBusy({});
    }
  };

  // /audit?demo=1 runs the whole flow with the sample bill and quote
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) loadDemo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = async (save, q = quote, inp = inputs, b = bill) => {
    if (!q || !inp.yearly_units) return;
    try {
      const r = await api("/audit/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: q, ...inp, bill: b?.extracted, save }),
      });
      setReport(r);
      if (save) setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(`Could not check the quote: ${e.message}`);
    }
  };

  // Once a report is showing, edits recalculate it instantly (not saved)
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => check(false), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, inputs]);

  const questionsText = report
    ? `Questions about my solar quote:\n${report.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

  const copyQuestions = async () => {
    await navigator.clipboard.writeText(questionsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Check your solar quote</h1>
        <p className="text-slate-600 mt-2">
          Upload your latest KSEB bill and the installer's quote. We check the size, price and promises
          against your real usage and satellite sunlight data for your area. Free, before you sign.
        </p>
        <button onClick={() => loadDemo(false)} className="mt-3 text-sm text-amber-700 underline underline-offset-2">
          No documents handy? Try with a sample bill and quote
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <FileDrop label="1. Electricity bill" hint="Photo of your latest KSEB bill"
                  busy={busy.bill} done={!!bill} onFile={(f) => read("bill", f)} />
        <FileDrop label="2. Installer's quote" hint="Photo or PDF of the quotation"
                  busy={busy.quote} done={!!quote} onFile={(f) => read("quote", f)} />
      </section>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 text-sm">{error}</div>}

      {(bill || quote) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg">3. Check the numbers we read</h2>
          <p className="text-sm text-slate-500">Correct anything that looks wrong. The result updates as you type.</p>

          <div className="grid gap-6 md:grid-cols-2 mt-4">
            <div className="space-y-3">
              <h3 className="font-medium">Your usage</h3>
              <NumberField label="Yearly electricity use" suffix="units"
                           value={inputs.yearly_units} onChange={(v) => setInputs({ ...inputs, yearly_units: v })} />
              {bill && <p className="text-xs text-slate-500">Based on {bill.analysis.yearly_basis}.</p>}
              <NumberField label="Connected load" suffix="kW"
                           value={inputs.connected_load_kw} onChange={(v) => setInputs({ ...inputs, connected_load_kw: v })} />
              <label className="block text-sm">
                <span className="text-slate-600">Your area</span>
                <select value={inputs.location} onChange={(e) => setInputs({ ...inputs, location: e.target.value })}
                        className="w-full mt-1 rounded-lg border border-slate-300 px-3 py-2">
                  {locations.map((l) => <option key={l.name} value={l.name}>{l.name} ({l.district})</option>)}
                </select>
              </label>
              {bill?.analysis.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">{w}</p>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="font-medium">The quote</h3>
              {quote ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {QUOTE_FIELDS.map(([key, label]) => (
                    <NumberField key={key} label={label} value={quote[key]}
                                 onChange={(v) => setQuote({ ...quote, [key]: v })} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Upload the quote to see its details here.</p>
              )}
            </div>
          </div>

          <button
            onClick={() => check(true)}
            disabled={!quote || !inputs.yearly_units}
            className="mt-6 w-full md:w-auto bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white px-6 py-3 rounded-lg font-semibold"
          >
            Check my quote
          </button>
        </section>
      )}

      {report && <Report report={report} reportRef={reportRef} questionsText={questionsText}
                         copyQuestions={copyQuestions} copied={copied} />}
    </div>
  );
}

function Report({ report, reportRef, questionsText, copyQuestions, copied }) {
  const v = VERDICTS[report.verdict];
  const { quoted, recommended, inputs } = report;

  const rows = [
    ["System size",
     quoted.advertised_kw && quoted.advertised_kw !== quoted.kw
       ? `${quoted.advertised_kw} kW (${quoted.kw} kWp panels)` : `${quoted.kw} kW`,
     `${recommended.kw} kW`],
    ["Price", rupees(quoted.price), `${rupees(recommended.cost_range[0])}–${rupees(recommended.cost_range[1])}`],
    ["Electricity generated / year", `${units(quoted.yearly_generation)} units`, `${units(recommended.yearly_generation)} units`],
    ["Exported cheaply to KSEB", `${units(quoted.exported)} units`, `${units(recommended.exported)} units`],
    ["Savings / year", rupees(quoted.yearly_savings), rupees(recommended.yearly_savings)],
    ["Payback", quoted.payback_years ? range(quoted.payback_years, " years") : "–",
                recommended.payback_years ? range(recommended.payback_years, " years") : "–"],
  ];

  return (
    <section ref={reportRef} className="space-y-6">
      <div className={`rounded-xl border-2 p-5 ${v.cls}`}>
        <div className="text-sm font-semibold uppercase tracking-wide">{v.icon} {v.label}</div>
        <p className="text-xl font-semibold mt-2">{report.headline}</p>
        {report.overpay_rs > 0 && (
          <p className="mt-2">You could save <b>{lakh(report.overpay_rs)}</b> by asking for the right size.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-lg mb-3">This quote vs the right size for you</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 font-normal"></th>
                <th className="py-2 font-semibold text-slate-900">This quote</th>
                <th className="py-2 font-semibold text-slate-900">Right size</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, a, b]) => (
                <tr key={label} className="border-t border-slate-100">
                  <td className="py-2 pr-2 text-slate-600">{label}</td>
                  <td className="py-2 pr-2 font-medium">{a}</td>
                  <td className="py-2 font-medium">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <GenerationChart quoted={quoted} recommended={recommended} usage={inputs.yearly_units} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-lg">What we found ({report.flags.length})</h2>
        <ul className="mt-3 space-y-3">
          {report.flags.map((f) => {
            const s = SEVERITY[f.severity];
            return (
              <li key={f.title} className="flex gap-3">
                <span className={`mt-0.5 w-20 shrink-0 text-xs font-semibold ${s.cls}`}>{s.icon} {s.label}</span>
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="text-sm text-slate-600">{f.detail}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {report.questions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-lg">Ask your installer before you sign</h2>
          <ol className="mt-3 space-y-2 list-decimal list-inside">
            {report.questions.map((q) => <li key={q}>{q}</li>)}
          </ol>
          <div className="flex flex-wrap gap-3 mt-4">
            <a href={`https://wa.me/?text=${encodeURIComponent(questionsText)}`} target="_blank" rel="noreferrer"
               className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Send on WhatsApp
            </a>
            <button onClick={copyQuestions} className="bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm font-semibold">
              {copied ? "Copied ✓" : "Copy questions"}
            </button>
            <button onClick={() => window.print()} className="bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm font-semibold">
              Print report
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        How we calculated: {inputs.location} produces about {units(inputs.yield_kwh_per_kw)} units per kW per year
        (2025 satellite sunlight, 75% system efficiency). Units used at home save ₹{inputs.tariff_rs}/unit;
        exported units earn about ₹{inputs.export_rate_rs}/unit. Fair price band ₹50,000–65,000 per kW.
        Estimates only. Your actual savings depend on your tariff slab and usage pattern.
      </p>
    </section>
  );
}
