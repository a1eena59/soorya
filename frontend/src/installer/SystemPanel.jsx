import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import HealthChart from "../components/HealthChart.jsx";
import { useConsole } from "./context.jsx";
import { Button, Chip, Drawer, KINDS, LANES, LaneBadge, WarrantyChip, ago, fmtDate, rupees } from "./ui.jsx";

const RANGES = [["30", "30 d"], ["90", "90 d"], ["365", "1 yr"]];

export default function SystemPanel() {
  const { selected, closeSystem, system, orders, messages, notify, schedule, refresh, toast } = useConsole();
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
  const sysOrders = orders.filter((o) => o.system_id === s.id);
  const sysMessages = messages.filter((m) => m.system_id === s.id);
  const past = alerts.filter((a) => a.status === "resolved");

  const finishVisit = async (id, status) => {
    await api(`/installer/work-orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    toast(status === "done" ? "Visit marked done. Soorya will confirm the fix from the next days' data" : "Visit cancelled");
    refresh();
  };

  return (
    <Drawer open={!!s} onClose={closeSystem}>
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">{s.name} · {s.location} · {s.capacity_kw} kW · installed {fmtDate(s.install_date)}</div>
            <h2 className="text-2xl font-bold mt-0.5">{s.owner_name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LaneBadge lane={s.lane} size="md" />
              <WarrantyChip covered={s.warranty_covered} />
              {s.source === "csv" && <Chip tone="blue">Customer-connected</Chip>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums" style={{ color: lane.color }}>{s.health_pct}%</div>
            <div className="text-xs text-slate-500">of what the sun allowed<br />last 7 days</div>
            <button onClick={closeSystem} className="mt-1 text-slate-400 hover:text-slate-700 text-sm">Close ✕</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.lane === "technician" && (
            <Button variant="dark" onClick={() => schedule(s)}>{s.work_order ? "Reschedule visit" : "Schedule visit"}</Button>
          )}
          {s.lane === "customer" && (
            <Button variant="primary" onClick={() => notify(s, "clean_panels")}>Send cleaning reminder</Button>
          )}
          <Button onClick={() => notify(s)}>Message customer</Button>
          {s.lane === "customer" && <Button onClick={() => schedule(s)}>Send a technician instead</Button>}
          <Link to={`/system/${s.id}`} target="_blank" className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Customer's view ↗
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {s.issue ? (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">{s.issue.name}</h3>
              <Chip tone="slate">{Math.round(s.issue.confidence * 100)}% confidence</Chip>
            </div>
            <p className="text-sm text-slate-700 mt-2">{s.issue.message}</p>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Why output is down</span>
                <span>{s.issue.fault_pct + s.issue.weather_pct}% below expected</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                <div style={{ width: `${s.issue.fault_pct}%`, background: lane.color }} title={`Fault: ${s.issue.fault_pct}%`} />
                <div style={{ width: `${s.issue.weather_pct}%` }} className="bg-slate-400" title={`Weather: ${s.issue.weather_pct}%`} />
              </div>
              <div className="flex gap-4 text-xs mt-1.5">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: lane.color }} />Fault {s.issue.fault_pct}%</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle bg-slate-400" />Local weather {s.issue.weather_pct}%</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
              <div><div className="text-slate-500 text-xs">Started</div><div className="font-medium">{fmtDate(s.issue.start_date)}</div></div>
              <div><div className="text-slate-500 text-xs">Detected</div><div className="font-medium">{fmtDate(s.issue.detected_date)}</div></div>
              <div><div className="text-slate-500 text-xs">Customer losing</div><div className="font-medium">{rupees(s.issue.rupees_per_month)}/month</div></div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Evidence</div>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {s.issue.reasons.map((r) => (
                  <li key={r} className="flex gap-2"><span className="text-slate-400">→</span>{r}</li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-sm"><b>Recommended:</b> {s.issue.action}.</p>
          </section>
        ) : (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm text-slate-700">
            {s.lane === "watch"
              ? "Output is below expected, but nearby systems dropped too (local weather) or the drop is too small to call a fault. No action needed; we keep watching."
              : "Producing what the sun allowed. Nothing to do."}
          </section>
        )}

        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Generation vs what the sun allowed</h3>
            <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden text-xs">
              {RANGES.map(([v, l]) => (
                <button key={v} onClick={() => setDays(v)}
                        className={`px-2.5 py-1 ${days === v ? "bg-slate-900 text-white" : "bg-white"}`}>{l}</button>
              ))}
            </div>
          </div>
          {health.length ? <HealthChart rows={health.slice(-Number(days))} faults={alerts.filter((a) => a.audience === "technician")} />
                         : <p className="text-sm text-slate-500">Loading…</p>}
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm">
            <h3 className="font-semibold mb-2">Customer</h3>
            <div>{s.phone}</div>
            <div className="text-slate-600">{s.email}</div>
            <div className="mt-2 text-slate-600">Warranty until {fmtDate(s.warranty_until)}</div>
            <p className="text-xs text-slate-400 mt-2">Demo contact details.</p>
          </section>

          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm">
            <h3 className="font-semibold mb-2">Visits</h3>
            {sysOrders.length === 0 && <p className="text-slate-500">No visits yet.</p>}
            <ul className="space-y-2">
              {sysOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span>{o.technician} · {fmtDate(o.scheduled_date)}</span>
                  {o.status === "scheduled" ? (
                    <span className="flex gap-1">
                      <Button size="sm" onClick={() => finishVisit(o.id, "done")}>Done</Button>
                      <Button size="sm" variant="ghost" onClick={() => finishVisit(o.id, "cancelled")}>Cancel</Button>
                    </span>
                  ) : <Chip tone="green">Done</Chip>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm">
          <h3 className="font-semibold mb-2">Messages sent</h3>
          {sysMessages.length === 0 ? <p className="text-slate-500">None yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {sysMessages.map((m) => (
                <li key={m.id} className="py-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{m.channel.toUpperCase()} · {KINDS[m.kind]}</span><span>{ago(m.sent_at)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2">{m.subject ?? m.message}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 text-sm">
            <h3 className="font-semibold mb-2">History</h3>
            <ul className="space-y-1">
              {past.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>{{ string_failure: "Panel string offline", inverter_off: "Inverter not producing", soiling: "Dust on panels" }[a.label]}</span>
                  <span className="text-slate-500">{shortRange(a.start_date, a.end_date)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}

const shortRange = (a, b) => `${fmtDate(a)} → ${fmtDate(b)}`;
