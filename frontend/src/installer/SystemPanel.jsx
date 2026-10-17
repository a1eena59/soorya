import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import HealthChart from "../components/HealthChart.jsx";
import { useConsole } from "./context.jsx";
import { Button, Chip, Drawer, LANES, LaneBadge, STAGES, WarrantyChip, fmtDate, shortDate } from "./ui.jsx";

const RANGES = [["30", "30 d"], ["90", "90 d"], ["365", "1 yr"]];
const WHO = { agent: "🤖", owner: "🏠", installer: "👤", technician: "🔧" };

export default function SystemPanel() {
  const { selected, closeSystem, system, orders, tickets, notify, schedule, complete } = useConsole();
  const s = selected ? system(selected) : null;
  const [health, setHealth] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [days, setDays] = useState("90");

  useEffect(() => {
    if (!selected) return;
    setHealth([]);
    Promise.all([api(`/systems/${selected}/health`), api(`/systems/${selected}/alerts`)])
      .then(([h, a]) => { setHealth(h); setAlerts(a); });
  }, [selected]);

  if (!s) return <Drawer open={false} onClose={closeSystem} />;
  const lane = LANES[s.lane];
  const sysOrders = orders.filter((o) => o.system_id === s.id && o.status !== "done");
  const ticket = tickets.find((t) => t.system_id === s.id && t.status === "open")
    ?? tickets.find((t) => t.system_id === s.id);

  return (
    <Drawer open={!!s} onClose={closeSystem}>
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold truncate">{s.owner_name}</h2>
            <div className="text-sm text-slate-500">{s.location} · {s.capacity_kw} kW · {s.inverter_model ?? s.name}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LaneBadge lane={s.lane} size="md" />
              <WarrantyChip covered={s.warranty_covered} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-bold tabular-nums" style={{ color: lane.color }}>{s.health_pct}%</div>
            <div className="text-xs text-slate-500">last 7 days</div>
            <button onClick={closeSystem} className="mt-1 text-slate-400 hover:text-slate-700 text-sm">Close ✕</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.lane === "technician" && <Button variant="dark" onClick={() => schedule(s)}>{s.work_order ? "Reschedule" : "Book visit"}</Button>}
          {s.lane === "customer" && <Button variant="primary" onClick={() => notify(s, "clean_panels")}>Remind owner</Button>}
          <Button onClick={() => notify(s)}>Message</Button>
          <Link to={`/system/${s.id}`} target="_blank" className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Owner's view ↗
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {s.issue ? (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">{s.issue.name}</h3>
              <Chip>{Math.round(s.issue.confidence * 100)}% sure</Chip>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
              <div><div className="text-slate-500 text-xs">Since</div><div className="font-medium">{fmtDate(s.issue.start_date)}</div></div>
              <div><div className="text-slate-500 text-xs">Output down</div><div className="font-medium">{s.issue.fault_pct}%</div></div>
              <div><div className="text-slate-500 text-xs">Detected</div><div className="font-medium">{fmtDate(s.issue.detected_date)}</div></div>
            </div>
            <details className="group mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-600 list-none">Why we think so <span className="text-xs group-open:rotate-180 inline-block transition">▾</span></summary>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {s.issue.reasons.map((r) => <li key={r} className="flex gap-2"><span className="text-slate-400">→</span>{r}</li>)}
              </ul>
            </details>
          </section>
        ) : (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm text-slate-600">
            {s.lane === "watch" ? "Low, but explained by local weather. No action." : "Working normally."}
          </section>
        )}

        {ticket && (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">🤖 Agent</h3>
              <Chip tone={ticket.status === "closed" ? "green" : "blue"}>
                {STAGES[ticket.stage]?.icon} {ticket.status === "closed" ? (ticket.resolution ?? "Closed").replace(/_/g, " ") : STAGES[ticket.stage]?.label}
              </Chip>
            </div>
            <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
              {ticket.events.map((e, i) => (
                <li key={i} className="ml-4 text-sm">
                  <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-white ring-2 ring-slate-300 text-[9px] flex items-center justify-center">{WHO[e.by]}</span>
                  <div className="text-xs text-slate-400">{shortDate(e.day)}</div>
                  <div className="text-slate-700">{e.text}</div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Generation</h3>
            <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden text-xs">
              {RANGES.map(([v, l]) => (
                <button key={v} onClick={() => setDays(v)} className={`px-2.5 py-1 ${days === v ? "bg-slate-900 text-white" : "bg-white"}`}>{l}</button>
              ))}
            </div>
          </div>
          {health.length ? <HealthChart rows={health.slice(-Number(days))} faults={alerts.filter((a) => a.audience === "technician")} />
                         : <div className="skeleton h-64" />}
        </section>

        {sysOrders.length > 0 && (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm">
            <h3 className="font-semibold mb-2">Visits</h3>
            <ul className="space-y-2">
              {sysOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span>{o.technician} · {fmtDate(o.scheduled_date)}{o.status === "proposed" ? " (to approve)" : ""}</span>
                  {o.status === "scheduled" && <Button size="sm" onClick={() => complete(o)}>Done</Button>}
                </li>
              ))}
            </ul>
            {sysOrders[0].notes && <p className="mt-3 text-xs text-slate-500">Job card: {sysOrders[0].notes}</p>}
          </section>
        )}
        <p className="text-xs text-slate-400">{s.phone} · {s.email} (demo contacts)</p>
      </div>
    </Drawer>
  );
}
