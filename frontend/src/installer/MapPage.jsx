import { useState } from "react";
import FleetMap from "./FleetMap.jsx";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Card, LANES, PageSkeleton } from "./ui.jsx";

export default function MapPage() {
  const { overview: o, fleet, openSystem } = useConsole();
  const [area, setArea] = useState(null);
  if (!o || !fleet) return <PageSkeleton />;

  const problems = fleet.filter((s) => (s.lane === "technician" || s.lane === "customer") && (!area || s.location === area));

  return (
    <div>
      <PageTitle title="Map" sub="Click a dot for details." />
      <div className="grid gap-6 xl:grid-cols-4 items-start">
        <Card className="xl:col-span-3">
          <FleetMap height={640} focusArea={area} />
        </Card>
        <div className="space-y-4">
          <Card title="Areas">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setArea(null)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${!area ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200"}`}>
                All Kerala
              </button>
              {o.by_area.map((a) => (
                <button key={a.location} onClick={() => setArea(a.location)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition
                          ${area === a.location ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:ring-slate-400"}`}>
                  {a.location}{a.technician + a.customer ? ` · ${a.technician + a.customer}` : ""}
                </button>
              ))}
            </div>
          </Card>
          <Card title={`Problems ${area ? `in ${area}` : "everywhere"} (${problems.length})`}>
            {problems.length === 0 ? <p className="text-sm text-slate-500">None here. All systems are fine. ✓</p> : (
              <ul className="space-y-1 max-h-[440px] overflow-y-auto -mx-2">
                {problems.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => openSystem(s.id)} className="w-full text-left rounded-lg px-2 py-2 hover:bg-slate-50 transition">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">{s.owner_name}</span>
                        <span className="tabular-nums text-slate-500">−{s.issue.fault_pct}%</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        <span style={{ color: LANES[s.lane].color }}>{LANES[s.lane].icon}</span> {s.issue.name} · {s.location}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
