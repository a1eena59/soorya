import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import Gauge from "../components/Gauge.jsx";
import HealthChart from "../components/HealthChart.jsx";
import { rupees, units } from "../format.js";
import { sendResponse } from "./Respond.jsx";

const STATUS = {
  ok: { icon: "✓", color: "#059669", cls: "bg-emerald-50 border-emerald-300 text-emerald-900" },
  weather: { icon: "☁", color: "#0284c7", cls: "bg-sky-50 border-sky-300 text-sky-900" },
  clean_panels: { icon: "!", color: "#d97706", cls: "bg-amber-50 border-amber-300 text-amber-900" },
  needs_technician: { icon: "▲", color: "#dc2626", cls: "bg-red-50 border-red-300 text-red-900" },
};
const ACTION_LABELS = { done: "Done", book_cleaning: "Book cleaning", call_me: "Call me", confirm: "Confirm visit", another_day: "Another day" };
const RANGES = [["30", "30 days"], ["90", "3 months"], ["365", "1 year"]];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–");

function Tile({ label, value }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 animate-rise">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

export default function MySystem() {
  const { id } = useParams();
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [ticket, setTicket] = useState(null);
  const [reply, setReply] = useState(null);
  const [days, setDays] = useState("90");
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    Promise.all([api(`/systems/${id}/summary`), api(`/systems/${id}/health`), api(`/systems/${id}/alerts`), api(`/systems/${id}/ticket`)])
      .then(([s, h, a, t]) => { setSummary(s); setHealth(h); setAlerts(a); setTicket(t); })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { setError(null); setReply(null); load(); }, [load]);

  if (error) return <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-4 text-red-800">Could not load this system.</div>;
  if (!summary) return <div className="space-y-6"><div className="skeleton h-12 w-72" /><div className="skeleton h-56" /><div className="skeleton h-28" /></div>;

  const { system, month } = summary;
  const st = STATUS[summary.status];
  const openAlert = alerts.find((a) => a.status === "open" && a.audience === "technician") ?? alerts.find((a) => a.status === "open");
  const respond = async (action) => {
    const r = await sendResponse(ticket.token, action);
    setReply(r.message);
    load();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{system.owner_name ?? system.name}</h1>
          <p className="text-slate-500">{system.capacity_kw} kW · {system.location}</p>
        </div>
        <Link to={`/system/${id}/report`} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition">
          Monthly report
        </Link>
      </header>

      <section className={`rounded-3xl border-2 p-6 animate-rise ${st.cls}`}>
        <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <div className="shrink-0 self-center bg-white/70 rounded-full p-2">
            <Gauge pct={summary.health_pct} color={st.color} label="of expected, last 7 days" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="text-2xl md:text-3xl font-bold">{st.icon} {summary.status_text}</div>
            {openAlert ? (
              <p className="text-lg">
                Down {Math.round(openAlert.fault_pct * 100)}% since {fmtDate(openAlert.start_date)}, about {rupees(openAlert.rupees_per_month)}/month.
              </p>
            ) : (
              <p className="text-lg">{summary.status === "weather" ? "Cloudy week. Nothing wrong with your panels." : "Making what the sun allows."}</p>
            )}

            {reply && <p className="rounded-xl bg-white/80 px-4 py-3 font-medium">✅ {reply}</p>}
            {!reply && ticket?.actions?.length > 0 && (
              <div className="rounded-2xl bg-white/80 p-4">
                <div className="text-sm font-semibold mb-2">
                  {ticket.stage === "technician" ? "A technician visit is planned" : "Can you help?"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ticket.actions.map((a, i) => (
                    <button key={a} onClick={() => respond(a)}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.98]
                                        ${i === 0 ? "bg-amber-500 hover:bg-amber-600 text-white" : "ring-1 ring-slate-300 bg-white hover:bg-slate-50"}`}>
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Tile label="Made, last 30 days" value={`${units(month.generated_kwh)} units`} />
        <Tile label="Saved, last 30 days" value={rupees(month.saved_rs)} />
        <Tile label="Lost to the problem" value={month.lost_rs ? `${rupees(month.lost_rs)}/mo` : "₹0"} />
        <Tile label="Warranty" value={summary.warranty_days_left > 0 ? `until ${fmtDate(system.warranty_until)}` : "Expired"} />
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-lg">Your generation</h2>
          <div className="flex rounded-lg ring-1 ring-slate-300 overflow-hidden text-sm">
            {RANGES.map(([v, label]) => (
              <button key={v} onClick={() => setDays(v)}
                      className={`px-3 py-1.5 ${days === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
        </div>
        <HealthChart rows={health.slice(-Number(days))} faults={alerts.filter((a) => a.audience === "technician")} />
      </section>

      <p className="text-sm text-slate-500">
        {units(summary.total.generated_kwh)} units made since {fmtDate(summary.first_day)}, about {rupees(summary.total.saved_rs)} saved.
      </p>
    </div>
  );
}
