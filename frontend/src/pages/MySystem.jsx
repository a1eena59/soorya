import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import HealthChart from "../components/HealthChart.jsx";
import { rupees, units } from "../format.js";

const STATUS = {
  ok: { icon: "✓", cls: "bg-emerald-50 border-emerald-300 text-emerald-900" },
  weather: { icon: "☁", cls: "bg-sky-50 border-sky-300 text-sky-900" },
  clean_panels: { icon: "!", cls: "bg-amber-50 border-amber-300 text-amber-900" },
  needs_technician: { icon: "▲", cls: "bg-red-50 border-red-300 text-red-900" },
};

const FAULT_NAMES = {
  string_failure: "Panel string offline",
  inverter_off: "Inverter not producing",
  soiling: "Dust on panels",
};

const RANGES = [["30", "30 days"], ["90", "3 months"], ["365", "1 year"]];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–");

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function installerMessage(system, alert) {
  return [
    `Hi, my rooftop solar system (${system.capacity_kw} kW, ${system.location}, installed ${fmtDate(system.install_date)}) needs a check.`,
    alert.message,
    `Reasons: ${alert.reasons.join("; ")}.`,
    "Please arrange a visit. (Detected by Soorya monitoring)",
  ].join("\n");
}

export default function MySystem() {
  const { id } = useParams();
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [days, setDays] = useState("365");
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    Promise.all([api(`/systems/${id}/summary`), api(`/systems/${id}/health`), api(`/systems/${id}/alerts`)])
      .then(([s, h, a]) => { setSummary(s); setHealth(h); setAlerts(a); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">Could not load this system: {error}</div>;
  if (!summary) return <p className="text-slate-500">Loading…</p>;

  const { system, month } = summary;
  const st = STATUS[summary.status];
  const openAlert = alerts.find((a) => a.status === "open" && a.audience === "technician")
    ?? alerts.find((a) => a.status === "open");
  const past = alerts.filter((a) => a.status === "resolved");
  const shown = health.slice(-Number(days));
  const warrantyYears = summary.warranty_days_left != null ? (summary.warranty_days_left / 365).toFixed(1) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{system.owner_name ?? system.name}</h1>
          <p className="text-slate-600">
            {system.capacity_kw} kW · {system.location} · installed {fmtDate(system.install_date)}
          </p>
        </div>
        <div className="text-right">
          <Link to={`/system/${id}/report`}
                className="inline-block bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            Monthly report
          </Link>
          <p className="text-sm text-slate-500 mt-1">Data up to {fmtDate(summary.as_of)}</p>
        </div>
      </header>

      <section className={`rounded-xl border-2 p-5 ${st.cls}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-2xl font-bold">{st.icon} {summary.status_text}</div>
          {summary.health_pct != null && (
            <div className="text-right">
              <div className="text-3xl font-bold">{summary.health_pct}%</div>
              <div className="text-xs">of what the sun allowed, last 7 days</div>
            </div>
          )}
        </div>
        {openAlert && (
          <div className="mt-4 space-y-3">
            <p className="text-lg">{openAlert.message}</p>
            <div>
              <div className="text-sm font-semibold">Why we think so</div>
              <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                {openAlert.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
            <p className="text-sm"><b>What to do:</b> {openAlert.action}.</p>
            {openAlert.audience === "technician" && (
              <a href={`https://wa.me/?text=${encodeURIComponent(installerMessage(system, openAlert))}`}
                 target="_blank" rel="noreferrer"
                 className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                Tell my installer on WhatsApp
              </a>
            )}
          </div>
        )}
        {!openAlert && summary.status === "ok" && (
          <p className="mt-3">Your panels are producing what the sun allowed. We check every day and will tell you if that changes.</p>
        )}
      </section>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Tile label="Made in the last 30 days" value={`${units(month.generated_kwh)} units`}
              sub={`Sun allowed ${units(month.expected_kwh)} units`} />
        <Tile label="Saved in the last 30 days" value={rupees(month.saved_rs)} sub={`at ₹${summary.tariff_rs}/unit`} />
        <Tile label="Being lost to the problem" value={month.lost_rs ? `${rupees(month.lost_rs)}/month` : "₹0"}
              sub={month.lost_rs ? "until it is fixed" : "nothing lost"} />
        <Tile label="Workmanship warranty"
              value={warrantyYears == null ? "Unknown" : summary.warranty_days_left > 0 ? `${warrantyYears} years left` : "Expired"}
              sub={system.warranty_until ? `until ${fmtDate(system.warranty_until)}` : "Add it from your quote"} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-lg">Generation vs what the sun allowed</h2>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
            {RANGES.map(([v, label]) => (
              <button key={v} onClick={() => setDays(v)}
                      className={`px-3 py-1.5 ${days === v ? "bg-slate-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <HealthChart rows={shown} faults={alerts.filter((a) => a.audience === "technician")} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">No false alarms on cloudy days</h2>
          <p className="text-sm text-slate-600 mt-2">
            On <b>{summary.weather_low_days} days</b> this year your output was low because of local clouds and rain.
            Nearby systems dropped too, so we did not raise an alarm. We only alert when your roof is low
            and your neighbours are not, for several days in a row.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Since {fmtDate(summary.first_day)}</h2>
          <p className="text-sm text-slate-600 mt-2">
            Your panels made <b>{units(summary.total.generated_kwh)} units</b>, saving about{" "}
            <b>{rupees(summary.total.saved_rs)}</b> on your electricity bill.
          </p>
        </div>
      </section>

      {past.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Past problems</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {past.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span>{FAULT_NAMES[a.label] ?? a.label}</span>
                <span className="text-slate-500">{fmtDate(a.start_date)} → fixed {fmtDate(a.end_date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-slate-500">
        Not your system? <Link to="/connect" className="text-amber-700 underline">Connect your own inverter</Link>.
      </p>
    </div>
  );
}
