import { useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Card, Chip, LANES, WarrantyChip, fmtDate, rupees, shortDate, PageSkeleton } from "./ui.jsx";

const ISSUE = { string_failure: "Panel string offline", inverter_off: "Inverter not producing", soiling: "Dust on panels" };

export default function Visits() {
  const { orders, fleet, technicians, schedule, openSystem, refresh, toast } = useConsole();
  const [tech, setTech] = useState("");
  if (!fleet) return <PageSkeleton />;

  const upcoming = orders.filter((o) => o.status === "scheduled" && (!tech || o.technician === tech));
  const done = orders.filter((o) => o.status === "done" && (!tech || o.technician === tech));
  const unscheduled = fleet.filter((s) => s.lane === "technician" && !s.work_order);

  // Day -> area -> visits: one technician, one area per trip
  const byDay = {};
  for (const o of upcoming) ((byDay[o.scheduled_date] ??= {})[o.location] ??= []).push(o);

  const setStatus = async (o, status) => {
    await api(`/installer/work-orders/${o.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    toast(status === "done" ? `${o.owner_name}: visit done. We'll confirm the fix from the next days' data` : "Visit cancelled");
    refresh();
  };

  return (
    <div>
      <PageTitle title="Technician visits" sub="Book visits only where the data says a technician is needed. Grouped by day and area for routing."
                 actions={
                   <select value={tech} onChange={(e) => setTech(e.target.value)} className="rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm bg-white">
                     <option value="">All technicians</option>
                     {technicians.map((t) => <option key={t}>{t}</option>)}
                   </select>
                 } />

      <div className="grid gap-4 grid-cols-3 mb-6">
        {technicians.map((t) => {
          const n = orders.filter((o) => o.technician === t && o.status === "scheduled").length;
          return (
            <button key={t} onClick={() => setTech(tech === t ? "" : t)}
                    className={`rounded-2xl bg-white ring-1 p-4 text-left shadow-sm ${tech === t ? "ring-2 ring-slate-900" : "ring-slate-200"}`}>
              <div className="font-semibold">🔧 {t}</div>
              <div className="text-sm text-slate-500">{n} upcoming visit{n === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-3 items-start">
        <div className="xl:col-span-2 space-y-5">
          {Object.keys(byDay).length === 0 && (
            <Card><p className="text-sm text-slate-500">No visits booked{tech ? ` for ${tech}` : ""}. Schedule from the list on the right or the work queue.</p></Card>
          )}
          {Object.entries(byDay).sort().map(([day, areas]) => (
            <Card key={day} title={fmtDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
              <div className="space-y-4">
                {Object.entries(areas).map(([area, list]) => (
                  <div key={area}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">📍 {area} · {list.length} stop{list.length > 1 ? "s" : ""}</div>
                    <ul className="space-y-2">
                      {list.map((o) => (
                        <li key={o.id} className="rounded-xl ring-1 ring-slate-200 p-3 flex flex-wrap items-center gap-3">
                          <button className="flex-1 min-w-[220px] text-left" onClick={() => openSystem(o.system_id)}>
                            <div className="font-medium">{o.owner_name} <span className="text-xs text-slate-500">{o.name}</span></div>
                            <div className="text-sm text-slate-600">
                              {o.issue_name ?? "Check-up"}{o.rupees_per_month ? ` · ${rupees(o.rupees_per_month)}/mo` : ""} · {o.phone}
                            </div>
                            <div className="mt-1 flex gap-1.5"><Chip>🔧 {o.technician}</Chip><WarrantyChip covered={o.warranty_covered} /></div>
                          </button>
                          <div className="flex gap-2">
                            <Button size="sm" variant="dark" onClick={() => setStatus(o, "done")}>Mark done</Button>
                            <Button size="sm" variant="ghost" onClick={() => setStatus(o, "cancelled")}>Cancel</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {done.length > 0 && (
            <Card title={`Completed (${done.length})`}>
              <ul className="text-sm divide-y divide-slate-100">
                {done.map((o) => (
                  <li key={o.id} className="py-2 flex justify-between">
                    <span>{o.owner_name} · {o.location} · {o.issue_name ?? "Check-up"}</span>
                    <span className="text-slate-500">{o.technician}, {shortDate(o.scheduled_date)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card title={`Waiting for a visit (${unscheduled.length})`}>
          {unscheduled.length === 0 ? <p className="text-sm text-slate-500">Every technician job is booked. 🎉</p> : (
            <ul className="space-y-2">
              {unscheduled.map((s) => (
                <li key={s.id} className="rounded-xl ring-1 ring-slate-200 p-3">
                  <button className="text-left w-full" onClick={() => openSystem(s.id)}>
                    <div className="font-medium">{s.owner_name}</div>
                    <div className="text-xs text-slate-600">
                      <span style={{ color: LANES.technician.color }}>▲</span> {s.issue.name} · {s.location} · {s.issue.days_open} days open
                    </div>
                  </button>
                  <div className="mt-2 flex items-center justify-between">
                    <WarrantyChip covered={s.warranty_covered} />
                    <Button size="sm" variant="dark" onClick={() => schedule(s)}>Schedule</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
