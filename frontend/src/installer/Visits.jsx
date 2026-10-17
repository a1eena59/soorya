import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Card, Chip, WarrantyChip, fmtDate, shortDate, PageSkeleton } from "./ui.jsx";

const FAULT = { soiling: "Dust", string_failure: "String offline", inverter_off: "Inverter off" };

export default function Visits() {
  const { orders, fleet, technicians, busy, complete, approveAll, openSystem } = useConsole();
  const [routes, setRoutes] = useState([]);

  // Each technician's booked visits in driving order (from their home base)
  useEffect(() => {
    Promise.all(technicians.map((t) => api(`/technicians/${encodeURIComponent(t)}/jobs`))).then(setRoutes);
  }, [technicians, orders]);

  if (!fleet) return <PageSkeleton />;
  const proposed = orders.filter((o) => o.status === "proposed");
  const done = orders.filter((o) => o.status === "done" || o.status === "not_fixed");
  const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
  const days = [...new Set(routes.flatMap((r) => r.days.map((d) => d.day)))].sort();

  return (
    <div className="space-y-6">
      <PageTitle title="Visits" sub="Each technician's day, in driving order." />

      {proposed.length > 0 && (
        <Card title={`To approve (${proposed.length})`}
              action={<Button variant="dark" size="sm" onClick={approveAll} disabled={!!busy}>Approve all</Button>}>
          <ul className="divide-y divide-slate-100 text-sm">
            {proposed.map((o) => (
              <li key={o.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <button className="text-left" onClick={() => openSystem(o.system_id)}>
                  <b>{o.owner_name}</b> · {o.location} · {o.job === "cleaning" ? "Cleaning" : o.issue_name}
                </button>
                <span className="flex items-center gap-2"><WarrantyChip covered={o.warranty_covered} />
                  <Chip>🔧 {o.technician.split(" ")[0]}, {shortDate(o.scheduled_date)}</Chip></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {days.length === 0 && proposed.length === 0 && <Card><p className="text-sm text-slate-500">No visits booked.</p></Card>}

      {days.map((day) => (
        <Card key={day} title={fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}>
          <div className="grid gap-4 lg:grid-cols-3">
            {routes.map((r) => {
              const d = r.days.find((x) => x.day === day);
              if (!d) return null;
              return (
                <div key={r.technician} className="rounded-xl ring-1 ring-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">🔧 {r.technician}</div>
                    <a href={`/tech/${encodeURIComponent(r.technician)}`} target="_blank" rel="noreferrer"
                       className="text-xs text-slate-500 hover:text-slate-900">Phone view ↗</a>
                  </div>
                  <div className="text-xs text-slate-500">From {d.base} · {d.stops.length} stops · ~{d.km} km</div>
                  <ol className="mt-3 space-y-2">
                    {d.stops.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="w-6 h-6 shrink-0 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <button className="flex-1 min-w-0 text-left" onClick={() => openSystem(s.system_id)}>
                          <div className="font-medium truncate">{s.owner_name}</div>
                          <div className="text-xs text-slate-500">{s.location} · {s.job === "cleaning" ? "Cleaning" : FAULT[s.fault] ?? "Check"}
</div>
                        </button>
                        <Button size="sm" onClick={() => complete(byId[s.id])}>Report</Button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {done.length > 0 && (
        <Card title={`Reported (${done.length})`}>
          <ul className="text-sm divide-y divide-slate-100">
            {done.map((o) => (
              <li key={o.id} className="py-2 flex justify-between gap-3">
                <span>{o.owner_name} · {o.status === "done" ? `✓ ${o.confirmed_cause}` : "✗ Couldn't fix"}</span>
                <span className="text-slate-500">{o.technician.split(" ")[0]}, {shortDate(o.scheduled_date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
