import { useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Chip, LANES, Sparkline, WarrantyChip, ago, rupees, shortDate, PageSkeleton } from "./ui.jsx";

const COLUMNS = [
  ["technician", "Send a technician", "Faults the customer can't fix: string, inverter, wiring."],
  ["customer", "Customer can fix", "Dust. A message saves a visit; we confirm the fix from the data."],
  ["watch", "Watching", "Low, but local weather explains it or it's too small to call. No action."],
];

function IssueCard({ s }) {
  const { openSystem, schedule, notify } = useConsole();
  const lane = LANES[s.lane];
  return (
    <article className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow transition">
      <button onClick={() => openSystem(s.id)} className="block w-full text-left p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{s.owner_name}</div>
            <div className="text-xs text-slate-500">{s.name} · {s.location} · {s.capacity_kw} kW</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums" style={{ color: lane.color }}>{s.health_pct}%</div>
          </div>
        </div>
        {s.issue ? (
          <>
            <div className="mt-2 text-sm font-medium"><span style={{ color: lane.color }}>{lane.icon}</span> {s.issue.name}</div>
            <div className="text-xs text-slate-600 mt-0.5">since {shortDate(s.issue.start_date)}</div>
          </>
        ) : (
          <div className="mt-2 text-sm text-slate-600">{s.today_label === "weather_dip" ? "Local weather dip" : "Slightly below expected"}</div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <Sparkline values={s.spark} color={lane.color} />
          {s.issue && <span className="text-sm font-semibold">{rupees(s.issue.rupees_per_month)}<span className="text-xs font-normal text-slate-500">/mo</span></span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <WarrantyChip covered={s.warranty_covered} />
          {s.work_order && <Chip tone="green">{s.work_order.created_by === "autopilot" ? "🤖" : "🔧"} {s.work_order.technician} · {shortDate(s.work_order.scheduled_date)}</Chip>}
          {s.issue?.verifying && <Chip tone="blue">✓ Visited {shortDate(s.issue.verifying.visited)} · verifying fix</Chip>}
          {s.last_notified && !s.work_order && <Chip tone="blue">{s.last_notified.created_by === "autopilot" ? "🤖" : "✉"} Reminded {ago(s.last_notified.sent_at)}</Chip>}
        </div>
      </button>
      {s.lane !== "watch" && (
        <div className="flex gap-2 border-t border-slate-100 px-4 py-2.5">
          {s.lane === "technician" ? (
            <>
              <Button size="sm" variant={s.work_order ? "secondary" : "dark"} onClick={() => schedule(s)}>
                {s.work_order ? "Reschedule" : "Schedule visit"}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={() => notify(s, "clean_panels")}>Send reminder</Button>
              <Button size="sm" variant="ghost" onClick={() => schedule(s)}>Send technician</Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function Queue() {
  const { fleet, overview, refresh, toast } = useConsole();
  const [area, setArea] = useState("");
  const [channel, setChannel] = useState("sms");
  if (!fleet) return <PageSkeleton />;

  const areas = [...new Set(fleet.map((s) => s.location))].sort();
  const shown = fleet.filter((s) => !area || s.location === area);
  const healthy = shown.filter((s) => s.lane === "healthy").length;
  const unreminded = shown.filter((s) => s.lane === "customer" && !s.last_notified).length;

  const remindAll = async () => {
    const r = await api("/installer/notify/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane: "customer", channel }),
    });
    toast(r.sent ? `${r.sent} cleaning reminders logged by ${channel.toUpperCase()} (demo, not sent)` : "Everyone was already reminded this week");
    refresh();
  };

  return (
    <div>
      <PageTitle title="Work queue"
                 sub="Every open problem, sorted by who should act. Most urgent and most expensive first."
                 actions={
                   <select value={area} onChange={(e) => setArea(e.target.value)}
                           className="rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm bg-white">
                     <option value="">All areas</option>
                     {areas.map((a) => <option key={a}>{a}</option>)}
                   </select>
                 } />

      <div className="grid gap-5 lg:grid-cols-3 items-start">
        {COLUMNS.map(([lane, title, hint]) => {
          const items = shown.filter((s) => s.lane === lane);
          const l = LANES[lane];
          return (
            <section key={lane} className="rounded-2xl bg-slate-200/50 p-3">
              <div className="px-1 pb-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold flex items-center gap-2">
                    <span style={{ color: l.color }}>{l.icon}</span>{title}
                    <span className="rounded-full bg-white px-2 text-xs font-bold ring-1 ring-slate-200">{items.length}</span>
                  </h2>
                </div>
                <p className="text-xs text-slate-600 mt-1">{hint}</p>
                {lane === "customer" && items.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="primary" onClick={remindAll} disabled={!unreminded}>
                      Remind {unreminded || "all"} by
                    </Button>
                    <select value={channel} onChange={(e) => setChannel(e.target.value)}
                            className="rounded-md ring-1 ring-slate-300 px-2 py-1 text-xs bg-white">
                      <option value="sms">SMS</option><option value="email">Email</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {items.map((s) => <IssueCard key={s.id} s={s} />)}
                {items.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    {lane === "watch"
                      ? `Nothing to watch right now. ${overview?.kpis.false_alarms_avoided ?? ""} weather dips were handled without an alarm this year.`
                      : "All clear."}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-slate-500">
        <span style={{ color: LANES.healthy.color }}>✓</span> {healthy} other systems are healthy.
      </p>
    </div>
  );
}
