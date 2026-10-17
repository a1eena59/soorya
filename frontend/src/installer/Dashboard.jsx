import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import FleetMap from "./FleetMap.jsx";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Card, Info, Kpi, LANES, PageSkeleton, Switch, ago, fmtDate, rupees, shortDate } from "./ui.jsx";

function TrendTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 shadow px-3 py-2 text-sm">
      <div className="font-semibold">{fmtDate(d.day)}</div>
      <div>Fleet average: <b>{d.health}%</b> of what the sun allowed</div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// What's already been done for a problem, in a few words
function statusOf(s) {
  if (s.issue?.verifying) return { text: "Visited · verifying fix", tone: "text-sky-700" };
  if (s.work_order) return { text: `${s.work_order.created_by === "autopilot" ? "🤖 " : ""}${s.work_order.technician.split(" ")[0]}, ${shortDate(s.work_order.scheduled_date)}`, tone: "text-emerald-700" };
  if (s.last_notified) return { text: `${s.last_notified.created_by === "autopilot" ? "🤖 " : ""}Reminded ${ago(s.last_notified.sent_at)}`, tone: "text-emerald-700" };
  return null;
}

export default function Dashboard() {
  const { overview: o, fleet, autopilot, openSystem, schedule, notify, setAutopilotOn } = useConsole();
  const navigate = useNavigate();
  if (!o || !fleet || !autopilot) return <PageSkeleton />;
  const k = o.kpis;
  const ap = autopilot.settings;
  const open = fleet.filter((s) => s.lane === "technician" || s.lane === "customer");
  const todo = open.filter((s) => !statusOf(s));
  const priority = [...todo, ...open.filter((s) => statusOf(s))].slice(0, 7);

  return (
    <div className="space-y-6">
      <PageTitle
        title={greeting()}
        sub={<>
          <b className="text-red-700">{k.lanes.technician} need a technician</b> ·{" "}
          <b className="text-amber-700">{k.lanes.customer} customers can fix it themselves</b> ·{" "}
          <b className="text-emerald-700">{k.lanes.healthy} healthy</b>
        </>}
        actions={<Button variant="dark" onClick={() => navigate("/queue")}>Open work queue →</Button>} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label={<>Fleet health <Info text="Average of every system's output over the last 7 days, compared with what satellite sunlight says that roof should make." /></>}
             value={`${k.fleet_health_pct}%`} icon="☀" sub={`${k.underperforming} below 90%`} onClick={() => navigate("/fleet?under=1")} />
        <Kpi label="Need a technician" value={k.lanes.technician} tone="technician" icon="▲"
             sub={k.visits_unscheduled ? `${k.visits_unscheduled} not booked` : "All booked"} onClick={() => navigate("/queue")} />
        <Kpi label="Customer can fix" value={k.lanes.customer} tone="customer" icon="◆"
             sub="Dust: a reminder, no visit" onClick={() => navigate("/queue")} />
        <div className={`rounded-2xl p-4 shadow-sm ring-1 animate-rise transition-colors
                         ${ap.enabled ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">🤖 Autopilot</span>
            <Switch on={ap.enabled} onChange={setAutopilotOn} />
          </div>
          <div className="text-3xl font-bold mt-1">{ap.enabled ? "On" : "Off"}</div>
          <button onClick={() => navigate("/autopilot")} className="text-xs text-slate-500 hover:text-slate-800 mt-1">
            {ap.enabled ? "Books visits and messages customers automatically →" : "Turn on to book visits and message customers automatically →"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title={todo.length ? `To do (${todo.length})` : "All handled ✓"} className="xl:col-span-3">
          <ul className="divide-y divide-slate-100 -mx-2">
            {priority.map((s) => {
              const st = statusOf(s);
              return (
                <li key={s.id} className="px-2 py-3 flex items-center gap-3 rounded-lg hover:bg-slate-50 transition">
                  <span className="text-lg" style={{ color: LANES[s.lane].color }}>{LANES[s.lane].icon}</span>
                  <button onClick={() => openSystem(s.id)} className="flex-1 min-w-0 text-left">
                    <div className="font-semibold truncate">{s.owner_name} <span className="font-normal text-slate-500 text-sm">· {s.location}</span></div>
                    <div className="text-sm text-slate-600">{s.issue.name} · {rupees(s.issue.rupees_per_month)}/mo</div>
                  </button>
                  {st ? (
                    <span className={`text-sm font-medium whitespace-nowrap ${st.tone}`}>{st.text}</span>
                  ) : s.lane === "technician" ? (
                    <Button size="sm" variant="dark" onClick={() => schedule(s)}>Book visit</Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => notify(s, "clean_panels")}>Remind</Button>
                  )}
                </li>
              );
            })}
          </ul>
          <button onClick={() => navigate("/queue")} className="mt-3 text-sm font-medium text-slate-600 hover:text-slate-900">
            All {open.length} open problems →
          </button>
        </Card>

        <Card title="Where the problems are" className="xl:col-span-2"
              action={<button onClick={() => navigate("/map")} className="text-sm text-slate-600 hover:text-slate-900">Full map →</button>}>
          <FleetMap height={430} showFilters={false} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Fleet health, last 6 months" className="xl:col-span-3">
          <div className="h-52">
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

        <Card title="This year" className="xl:col-span-2">
          <ul className="space-y-4">
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-slate-600">Visits avoided <Info text={`Dust problems customers fixed after a reminder. About ${rupees(k.avoided_visits_rs)} of technician time.`} /></span>
              <span className="text-2xl font-bold tabular-nums">{k.avoided_visits}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-slate-600">False alarms avoided <Info text="Low-output spells caused by local clouds: nearby roofs dropped too, so nobody was sent." /></span>
              <span className="text-2xl font-bold tabular-nums">{k.false_alarms_avoided}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-slate-600">Fixes being verified <Info text="Technician has visited; the next days' generation confirms the fix." /></span>
              <span className="text-2xl font-bold tabular-nums">{k.fixes_verifying}</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
