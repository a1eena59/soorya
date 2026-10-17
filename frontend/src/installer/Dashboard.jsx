import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import FleetMap from "./FleetMap.jsx";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { AgentToggle, Button, Card, Kpi, LANES, PageSkeleton, STAGES, fmtDate, shortDate } from "./ui.jsx";

function TrendTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 shadow px-3 py-2 text-sm">
      <div className="font-semibold">{fmtDate(d.day)}</div>
      <div>Fleet: <b>{d.health}%</b></div>
    </div>
  );
}

function statusOf(s) {
  if (s.work_order?.status === "proposed") return { text: "Visit to approve", tone: "text-amber-700" };
  if (s.work_order) return { text: `${s.work_order.technician.split(" ")[0]}, ${shortDate(s.work_order.scheduled_date)}`, tone: "text-emerald-700" };
  if (s.ticket) return { text: STAGES[s.ticket.stage]?.label, tone: "text-sky-700" };
  return null;
}

export default function Dashboard() {
  const { overview: o, fleet, agent, busy, openSystem, schedule, notify, setAgentOn, approveAll } = useConsole();
  const navigate = useNavigate();
  if (!o || !fleet || !agent) return <PageSkeleton />;
  const k = o.kpis;
  const on = agent.settings.enabled;
  const p = agent.summary.proposed;
  const open = fleet.filter((s) => s.lane === "technician" || s.lane === "customer");
  const sorted = [...open.filter((s) => !statusOf(s)), ...open.filter((s) => statusOf(s))].slice(0, 7);

  return (
    <div className="space-y-6">
      <PageTitle title="Dashboard" sub={`${k.systems} systems · ${k.capacity_kw} kW`} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Fleet health" value={`${k.fleet_health_pct}%`} icon="☀" sub={`${k.underperforming} below 90%`}
             onClick={() => navigate("/fleet?under=1")} />
        <Kpi label="Need a technician" value={k.lanes.technician} tone="technician" icon="▲" onClick={() => navigate("/agent")} />
        <Kpi label="Owner can fix" value={k.lanes.customer} tone="customer" icon="◆" onClick={() => navigate("/agent")} />
        <div className={`rounded-2xl p-4 shadow-sm ring-1 animate-rise flex flex-col justify-between gap-3
                         ${on ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
          <div className="text-sm text-slate-500">🤖 Agent</div>
          <AgentToggle on={on} onChange={setAgentOn} disabled={!!busy} />
          <button onClick={() => navigate("/agent")} className="text-left text-xs text-slate-500 hover:text-slate-900">
            {on ? `${agent.summary.open} open · ${agent.summary.fixed} fixed →` : "Fixes faults end to end →"}
          </button>
        </div>
      </div>

      {p.jobs > 0 && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 flex flex-wrap items-center justify-between gap-3 animate-rise">
          <div>
            <b>{p.jobs} visits ready to book</b>
            <span className="text-amber-900"> · {p.warranty} under warranty</span>
          </div>
          <Button variant="dark" onClick={approveAll} disabled={!!busy}>Approve all</Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title={`Open problems (${open.length})`} className="xl:col-span-3">
          <ul className="divide-y divide-slate-100 -mx-2">
            {sorted.map((s) => {
              const st = statusOf(s);
              return (
                <li key={s.id} className="px-2 py-3 flex items-center gap-3 rounded-lg hover:bg-slate-50 transition">
                  <span style={{ color: LANES[s.lane].color }}>{LANES[s.lane].icon}</span>
                  <button onClick={() => openSystem(s.id)} className="flex-1 min-w-0 text-left">
                    <div className="font-semibold truncate">{s.owner_name}</div>
                    <div className="text-sm text-slate-500">{s.issue.name} · −{s.issue.fault_pct}%</div>
                  </button>
                  {st ? <span className={`text-sm font-medium whitespace-nowrap ${st.tone}`}>{st.text}</span>
                    : s.lane === "technician"
                      ? <Button size="sm" variant="dark" onClick={() => schedule(s)}>Book</Button>
                      : <Button size="sm" variant="primary" onClick={() => notify(s, "clean_panels")}>Remind</Button>}
                </li>
              );
            })}
          </ul>
          <button onClick={() => navigate("/fleet?under=1")} className="mt-3 text-sm font-medium text-slate-600 hover:text-slate-900">See all →</button>
        </Card>
        <Card title="Map" className="xl:col-span-2"
              action={<button onClick={() => navigate("/map")} className="text-sm text-slate-600 hover:text-slate-900">Open →</button>}>
          <FleetMap height={420} showFilters={false} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Fleet health" className="xl:col-span-3">
          <div className="h-48">
            <ResponsiveContainer>
              <AreaChart data={o.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2a78d6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="day" tickFormatter={shortDate} minTickGap={50} tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[70, 105]} ticks={[70, 80, 90, 100]} tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} width={40} unit="%" />
                <ReferenceLine y={90} stroke="#94a3b8" strokeDasharray="4 4" />
                <Tooltip content={<TrendTip />} cursor={{ stroke: "#a8a29e" }} />
                <Area dataKey="health" stroke="#2a78d6" strokeWidth={2} fill="url(#fh)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Impact" className="xl:col-span-2">
          <ul className="space-y-3">
            {[["Fixed by the agent", agent.summary.fixed], ["Open tickets", agent.summary.open],
              ["False alarms avoided", k.false_alarms_avoided]].map(([label, v]) => (
              <li key={label} className="flex items-baseline justify-between">
                <span className="text-slate-600">{label}</span><span className="text-xl font-bold tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
