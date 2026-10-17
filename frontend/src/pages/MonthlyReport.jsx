import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api.js";
import { rupees, units } from "../format.js";

const MADE = "#2a78d6";        // validated series colour
const EXPECTED = "#52514e";    // neutral reference
const PROBLEM_FILL = "#e34948";

const STATUS = {
  good: { icon: "✓", label: "Working well", cls: "bg-emerald-50 border-emerald-300 text-emerald-900" },
  watch: { icon: "●", label: "Slightly low", cls: "bg-sky-50 border-sky-300 text-sky-900" },
  dust: { icon: "!", label: "Dust on panels", cls: "bg-amber-50 border-amber-300 text-amber-900" },
  problem: { icon: "▲", label: "Problem found", cls: "bg-red-50 border-red-300 text-red-900" },
};

const PROBLEM_NAMES = { string_failure: "Panel string offline", inverter_off: "Inverter not producing", soiling: "Dust on panels" };
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 break-inside-avoid">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow">
      <div className="font-semibold">{fmtDate(d.day)}</div>
      <div>Made: <b>{d.made.toFixed(1)} units</b></div>
      <div>Sun allowed: {d.expected.toFixed(1)} units</div>
      <div>Rain: {d.rain_mm ?? "–"} mm</div>
      {d.problem && <div className="text-red-700 mt-1">Problem active</div>}
    </div>
  );
}

function shareText(r) {
  return [
    `☀ My solar report, ${r.label} (${r.system.capacity_kw} kW, ${r.system.location})`,
    `Made ${units(r.made_kwh)} units, ${r.performance_pct}% of what the sun allowed.`,
    `Saved about ${rupees(r.saved_rs)} on electricity.`,
    r.headline,
    "Checked independently by Soorya.",
  ].join("\n");
}

export default function MonthlyReport() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const month = params.get("month");

  useEffect(() => {
    setError(null);
    api(`/systems/${id}/report${month ? `?month=${month}` : ""}`).then(setR).catch((e) => setError(e.message));
  }, [id, month]);

  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">Could not load the report: {error}</div>;
  if (!r) return <p className="text-slate-500">Loading…</p>;

  const st = STATUS[r.status];
  const i = r.months.indexOf(r.month);
  const older = r.months[i + 1];
  const newer = r.months[i - 1];
  const change = r.previous.made_kwh ? Math.round(((r.made_kwh - r.previous.made_kwh) / r.previous.made_kwh) * 100) : null;
  const problemDays = r.days.filter((d) => d.problem);
  const chartDays = r.days.map((d) => ({ ...d, n: Number(d.day.slice(8)) }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/system/${id}`} className="text-sm text-slate-600 hover:text-slate-900">← Back to my system</Link>
        <div className="flex items-center gap-2">
          <button disabled={!older} onClick={() => setParams({ month: older })}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">←</button>
          <select value={r.month} onChange={(e) => setParams({ month: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 bg-white">
            {r.months.map((m) => (
              <option key={m} value={m}>{new Date(`${m}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>
            ))}
          </select>
          <button disabled={!newer} onClick={() => setParams({ month: newer })}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">→</button>
        </div>
      </div>

      <header>
        <div className="text-sm font-semibold text-amber-600 uppercase tracking-wide">Monthly solar report</div>
        <h1 className="text-3xl font-bold mt-1">{r.label}</h1>
        <p className="text-slate-600">{r.system.name} · {r.system.capacity_kw} kW · {r.system.location}</p>
      </header>

      <section className={`rounded-2xl border-2 p-5 animate-rise ${st.cls}`}>
        <div className="text-sm font-semibold uppercase tracking-wide">{st.icon} {st.label}</div>
        <p className="text-xl font-semibold mt-2">{r.headline}</p>
      </section>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Electricity made" value={`${units(r.made_kwh)} units`}
              sub={change == null ? null : `${change >= 0 ? "+" : ""}${change}% vs previous month`} />
        <Stat label="Performance" value={`${r.performance_pct}%`} sub={`of ${units(r.expected_kwh)} units the sun allowed`} />
        <Stat label="Saved on your bill" value={rupees(r.saved_rs)} sub={`at ₹${r.tariff_rs}/unit`} />
        <Stat label="Lost to problems" value={rupees(r.lost_rs)} sub={r.lost_kwh ? `${units(r.lost_kwh)} units` : "nothing lost"} />
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 break-inside-avoid">
        <h2 className="font-semibold text-lg">Every day this month</h2>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600 mt-1">
          <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: MADE }} />Made</span>
          <span><span className="inline-block w-4 mr-1 align-middle border-t-2 border-dashed" style={{ borderColor: EXPECTED }} />Sun allowed</span>
          {problemDays.length > 0 && (
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: PROBLEM_FILL, opacity: 0.18 }} />Problem active</span>
          )}
        </div>
        <div className="h-64 mt-2">
          <ResponsiveContainer>
            <ComposedChart data={chartDays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e7e5e4" />
              <XAxis dataKey="n" tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} width={36}
                     label={{ value: "units", angle: -90, position: "insideLeft", fill: "#52514e", fontSize: 12 }} />
              {problemDays.length > 0 && (
                <ReferenceArea x1={Number(problemDays[0].day.slice(8))} x2={Number(problemDays.at(-1).day.slice(8))}
                               fill={PROBLEM_FILL} fillOpacity={0.1} />
              )}
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="made" fill={MADE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line dataKey="expected" stroke={EXPECTED} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-1">Day of the month. Best day: {fmtDate(r.best_day.day)}, {r.best_day.kwh} units.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 break-inside-avoid">
          <h2 className="font-semibold">Weather this month</h2>
          <p className="text-sm text-slate-600 mt-2">
            {units(r.weather.rain_mm)} mm of rain, {r.weather.rainy_days} heavy-rain days.{" "}
            {r.weather.weather_low_days > 0
              ? `On ${r.weather.weather_low_days} days output was low because of local clouds. Nearby systems dropped too, so it was not a fault.`
              : "No days where local clouds pulled your output down unusually."}
          </p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 break-inside-avoid">
          <h2 className="font-semibold">Problems this month</h2>
          {r.alerts.length === 0 ? (
            <p className="text-sm text-slate-600 mt-2">None. Your system produced what the sun allowed.</p>
          ) : (
            <ul className="text-sm mt-2 space-y-1">
              {r.alerts.map((a) => (
                <li key={`${a.label}${a.start_date}`}>
                  <b>{PROBLEM_NAMES[a.label]}</b> since {fmtDate(a.start_date)}
                  {a.end_date ? `, fixed ${fmtDate(a.end_date)}` : ", not fixed yet"}
                </li>
              ))}
            </ul>
          )}
          {r.system.warranty_until && (
            <p className="text-xs text-slate-500 mt-3">Workmanship warranty until {fmtDate(r.system.warranty_until)}.</p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 print:hidden">
        <a href={`https://wa.me/?text=${encodeURIComponent(shareText(r))}`} target="_blank" rel="noreferrer"
           className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          Share on WhatsApp
        </a>
        <button onClick={() => window.print()} className="bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm font-semibold">
          Save as PDF / print
        </button>
      </div>

      <p className="text-xs text-slate-500">
        "Sun allowed" is calculated from satellite sunlight for {r.system.location} and this system's own performance in its first month.
        Savings assume every unit replaces one bought at ₹{r.tariff_rs}.
      </p>
    </div>
  );
}
