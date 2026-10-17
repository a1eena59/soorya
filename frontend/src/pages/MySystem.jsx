import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import Gauge from "../components/Gauge.jsx";
import HealthChart from "../components/HealthChart.jsx";
import { rupees, units } from "../format.js";

const STATUS = {
  ok: { icon: "✓", color: "#059669", cls: "bg-emerald-50 border-emerald-300 text-emerald-900" },
  weather: { icon: "☁", color: "#0284c7", cls: "bg-sky-50 border-sky-300 text-sky-900" },
  clean_panels: { icon: "!", color: "#d97706", cls: "bg-amber-50 border-amber-300 text-amber-900" },
  needs_technician: { icon: "▲", color: "#dc2626", cls: "bg-red-50 border-red-300 text-red-900" },
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
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 animate-rise">
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
  if (!summary) return <div className="space-y-6"><div className="skeleton h-12 w-72" /><div className="skeleton h-56" /><div className="skeleton h-28" /></div>;

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
                className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition">
            Monthly report
          </Link>
          <p className="text-sm text-slate-500 mt-1">Data up to {fmtDate(summary.as_of)}</p>
        </div>
      </header>

      <section className={`rounded-3xl border-2 p-6 animate-rise ${st.cls}`}>
        <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <div className="shrink-0 self-center bg-white/70 rounded-full p-2">
            <Gauge pct={summary.health_pct} color={st.color} label="of what the sun allowed (7 days)" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-2xl md:text-3xl font-bold">{st.icon} {summary.status_text}</div>
            {openAlert ? (
              <div className="mt-3 space-y-3">
                <p className="text-lg leading-relaxed">{openAlert.message}</p>
                <details className="group rounded-xl bg-white/60 px-4 py-2">
                  <summary className="cursor-pointer text-sm font-semibold list-none flex items-center justify-between">
                    How do we know? <span className="text-xs transition group-open:rotate-180">▼</span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {openAlert.reasons.map((r) => <li key={r} className="flex gap-2"><span>→</span>{r}</li>)}
                  </ul>
                </details>
                <p className="text-sm"><b>What to do:</b> {openAlert.action}.</p>
                {openAlert.audience === "technician" && (
                  <a href={`https://wa.me/?text=${encodeURIComponent(installerMessage(system, openAlert))}`}
                     target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition">
                    Tell my installer on WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-3 text-lg">
                {summary.status === "weather"
                  ? "Clouds and rain this week, and nearby systems dropped too. Nothing is wrong with your panels."
                  : "Your panels are making what the sun allows. We check every day and will tell you if that changes."}
              </p>
            )}
          </div>
        </div>
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

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
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
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <h2 className="font-semibold">No false alarms on cloudy days</h2>
          <p className="text-sm text-slate-600 mt-2">
            On <b>{summary.weather_low_days} days</b> this year your output was low because of local clouds and rain.
            Nearby systems dropped too, so we did not raise an alarm. We only alert when your roof is low
            and your neighbours are not, for several days in a row.
          </p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <h2 className="font-semibold">Since {fmtDate(summary.first_day)}</h2>
          <p className="text-sm text-slate-600 mt-2">
            Your panels made <b>{units(summary.total.generated_kwh)} units</b>, saving about{" "}
            <b>{rupees(summary.total.saved_rs)}</b> on your electricity bill.
          </p>
        </div>
      </section>

      {past.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
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
