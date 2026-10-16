import { NavLink, Outlet } from "react-router-dom";
import { ConsoleProvider, useConsole } from "./context.jsx";
import NotifyDialog from "./NotifyDialog.jsx";
import ScheduleDialog from "./ScheduleDialog.jsx";
import SystemPanel from "./SystemPanel.jsx";
import { Icon, Svg, fmtDate } from "./ui.jsx";

function Nav() {
  const { overview, orders } = useConsole();
  const lanes = overview?.kpis.lanes;
  const items = [
    ["/", "Dashboard", Icon.dashboard, null],
    ["/queue", "Work queue", Icon.queue, lanes ? lanes.technician + lanes.customer : null],
    ["/fleet", "Fleet", Icon.fleet, null],
    ["/visits", "Visits", Icon.visits, orders.filter((o) => o.status === "scheduled").length || null],
    ["/messages", "Messages", Icon.messages, null],
    ["/detection", "Detection accuracy", Icon.detection, null],
  ];
  return (
    <nav className="space-y-1">
      {items.map(([to, label, icon, badge]) => (
        <NavLink key={to} to={to} end={to === "/"}
                 className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition
                   ${isActive ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
          <Svg>{icon}</Svg>
          <span className="flex-1">{label}</span>
          {badge ? <span className="rounded-full bg-amber-500 text-slate-900 text-xs font-bold px-2 py-0.5">{badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

function Toasts() {
  const { toasts } = useConsole();
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-xl px-4 py-3 text-sm shadow-lg text-white ${t.tone === "error" ? "bg-red-600" : "bg-slate-900"}`}>
          {t.tone === "error" ? "⚠ " : "✓ "}{t.text}
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { overview, error, refresh } = useConsole();
  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-white flex flex-col">
        <div className="px-5 py-5">
          <div className="text-xl font-bold"><span className="text-amber-400">☀</span> Soorya</div>
          <div className="text-xs text-slate-400 mt-0.5">Maintenance console</div>
        </div>
        <div className="px-3 flex-1"><Nav /></div>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-slate-400 space-y-2">
          <div>
            <div className="text-slate-200 font-medium">{overview?.installer ?? "…"}</div>
            <div>{overview ? `${overview.kpis.systems} systems · ${overview.kpis.capacity_kw} kW` : ""}</div>
          </div>
          <NavLink to="/customer" className="flex items-center gap-2 hover:text-white">
            <Svg className="w-4 h-4">{Icon.customer}</Svg> Customer app
          </NavLink>
        </div>
      </aside>

      <div className="flex-1 lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 bg-slate-100/90 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            {overview ? <>Data up to <b>{fmtDate(overview.as_of)}</b> · daily from inverter reports + satellite weather</> : "Loading…"}
          </div>
          <button onClick={refresh} className="text-sm text-slate-600 hover:text-slate-900">↻ Refresh</button>
        </header>
        <main className="p-6 max-w-[1400px]">
          {error ? (
            <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-red-800">Could not reach the API: {error}</div>
          ) : <Outlet />}
        </main>
      </div>

      <SystemPanel />
      <NotifyDialog />
      <ScheduleDialog />
      <Toasts />
    </div>
  );
}

export default function Layout() {
  return <ConsoleProvider><Shell /></ConsoleProvider>;
}

export function PageTitle({ title, sub, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-slate-600 mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
