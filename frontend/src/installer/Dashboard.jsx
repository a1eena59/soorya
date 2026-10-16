import { useNavigate } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api.js";
import AreaMap from "./AreaMap.jsx";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Card, Kpi, LANES, WarrantyChip, ago, fmtDate, rupees, shortDate } from "./ui.jsx";

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

function AreaTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 shadow px-3 py-2 text-sm">
      <div className="font-semibold">{label}</div>
      <div><span style={{ color: LANES.technician.color }}>▲</span> Technician: {d.technician}</div>
      <div><span style={{ color: LANES.customer.color }}>◆</span> Customer can fix: {d.customer}</div>
      <div className="text-slate-500">{rupees(d.rupees_per_month)}/month being lost</div>
    </div>
  );
}

export default function Dashboard() {
  const { overview: o, fleet, openSystem, schedule, notify, refresh, toast } = useConsole();
  const navigate = useNavigate();
  if (!o || !fleet) return <p className="text-slate-500">Loading fleet…</p>;
  const k = o.kpis;
  // Biggest technician jobs first, plus the costliest dust cases (a message fixes those)
  const priority = [...fleet.filter((s) => s.lane === "technician").slice(0, 5),
                    ...fleet.filter((s) => s.lane === "customer").slice(0, 3)];
  const areaIssues = o.by_area.filter((a) => a.technician + a.customer > 0);
  const dustToRemind = fleet.filter((s) => s.lane === "customer" && !s.last_notified).length;

  const remindAll = async () => {
    const r = await api("/installer/notify/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane: "customer", channel: "sms" }),
    });
    toast(`${r.sent} cleaning reminders logged (demo, not sent)`);
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Good morning" sub={`${o.installer} · here's what needs attention across your ${k.systems} systems.`}
                 actions={<>
                   <Button variant="dark" onClick={() => navigate("/queue")}>Open work queue →</Button>
                 </>} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Fleet health" value={`${k.fleet_health_pct}%`} icon="☀"
             sub={`${k.underperforming} systems under 90% of what the sun allowed`} onClick={() => navigate("/fleet?under=1")} />
        <Kpi label="Need a technician" value={k.lanes.technician} tone="technician" icon="▲"
             sub={`${k.visits_unscheduled} not scheduled yet · ${k.warranty_exposure} under your warranty`}
             onClick={() => navigate("/queue")} />
        <Kpi label="Customer can fix" value={k.lanes.customer} tone="customer" icon="◆"
             sub="Dust: a reminder message, no visit" onClick={() => navigate("/queue")} />
        <Kpi label="Customers losing" value={rupees(k.rupees_lost_per_month)} icon="₹"
             sub="per month across open problems" />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Visits avoided this year" value={k.avoided_visits}
             sub={`Dust cases fixed by customers · ~${rupees(k.avoided_visits_rs)} of technician time`} />
        <Kpi label="False alarms avoided" value={k.false_alarms_avoided}
             sub="Low-output spells explained by local weather, not flagged" />
        <Kpi label="Visits booked" value={k.visits_scheduled} sub="Upcoming technician visits" onClick={() => navigate("/visits")} />
        <Kpi label="Installed base" value={`${k.capacity_kw} kW`} sub={`${k.systems} rooftop systems`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Priority today" className="xl:col-span-3"
              action={dustToRemind > 0 && <Button size="sm" variant="primary" onClick={remindAll}>Remind all {dustToRemind} dust cases</Button>}>
          <ul className="divide-y divide-slate-100">
            {priority.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-center gap-3">
                <button onClick={() => openSystem(s.id)} className="flex-1 min-w-[220px] text-left group">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold group-hover:underline">{s.owner_name}</span>
                    <span className="text-xs text-slate-500">{s.location} · {s.capacity_kw} kW</span>
                  </div>
                  <div className="text-sm text-slate-600 mt-0.5">
                    <span style={{ color: LANES[s.lane].color }}>{LANES[s.lane].icon}</span> {s.issue.name}
                    {" "}· -{s.issue.fault_pct}% · {rupees(s.issue.rupees_per_month)}/mo · since {shortDate(s.issue.start_date)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5"><WarrantyChip covered={s.warranty_covered} />
                    {s.work_order && <span className="text-xs text-emerald-700">✓ {s.work_order.technician}, {shortDate(s.work_order.scheduled_date)}</span>}
                    {s.last_notified && <span className="text-xs text-slate-500">Messaged {ago(s.last_notified.sent_at)}</span>}
                  </div>
                </button>
                {s.lane === "technician" ? (
                  <Button size="sm" variant={s.work_order ? "secondary" : "dark"} onClick={() => schedule(s)}>
                    {s.work_order ? "Reschedule" : "Schedule visit"}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => notify(s, "clean_panels")}>Send reminder</Button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={() => navigate("/queue")} className="mt-2 text-sm text-slate-600 hover:text-slate-900">
            See all {k.lanes.technician + k.lanes.customer} open issues →
          </button>
        </Card>

        <Card title="Fleet by area" className="xl:col-span-2">
          <AreaMap areas={o.by_area} onSelect={(loc) => navigate(`/fleet?area=${encodeURIComponent(loc)}`)} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Fleet health, last 6 months" className="xl:col-span-3">
          <div className="h-56">
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
          <p className="text-xs text-slate-500 mt-1">Average of every system's 7-day health. Dashed line: 90% underperformance threshold. Monsoon dips hit everyone; faults pull single roofs down.</p>
        </Card>

        <Card title="Open issues by area" className="xl:col-span-2">
          <div className="flex gap-4 text-xs text-slate-600 mb-1">
            <span><span style={{ color: LANES.technician.color }}>■</span> Technician</span>
            <span><span style={{ color: LANES.customer.color }}>■</span> Customer can fix</span>
          </div>
          <div style={{ height: Math.max(140, areaIssues.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={areaIssues} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="location" width={128} tick={{ fill: "#334155", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<AreaTip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="technician" stackId="a" fill={LANES.technician.color} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                <Bar dataKey="customer" stackId="a" fill={LANES.customer.color} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Recent activity">
        {o.activity.length === 0 ? (
          <p className="text-sm text-slate-500">No visits booked or messages sent yet. Start from the work queue.</p>
        ) : (
          <ul className="text-sm divide-y divide-slate-100">
            {o.activity.map((a, i) => (
              <li key={i} className="py-2 flex justify-between gap-3">
                <span>{a.type === "visit" ? "🔧" : "✉"} <b>{a.owner_name}</b> ({a.location}): {a.what.replaceAll("_", " ")}</span>
                <span className="text-slate-500 whitespace-nowrap">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
