import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ConsoleProvider, useConsole } from "./context.jsx";
import NotifyDialog from "./NotifyDialog.jsx";
import ScheduleDialog from "./ScheduleDialog.jsx";
import SystemPanel from "./SystemPanel.jsx";
import CompleteDialog from "./CompleteDialog.jsx";
import { Icon, Svg, fmtDate } from "./ui.jsx";

function Nav({ onNavigate }) {
  const { agent } = useConsole();
  const items = [
    ["/", "Dashboard", Icon.dashboard, null],
    ["/agent", "Agent", Icon.autopilot, agent?.summary.proposed.jobs || (agent?.settings.enabled ? "ON" : null)],
    ["/map", "Map", Icon.map, null],
    ["/fleet", "Fleet", Icon.fleet, null],
    ["/visits", "Visits", Icon.visits, null],
    ["/messages", "Messages", Icon.messages, null],
    ["/detection", "Accuracy", Icon.detection, null],
  ];
  return (
    <nav className="space-y-1">
      {items.map(([to, label, icon, badge]) => (
        <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
                 className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition
                   ${isActive ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
          <Svg>{icon}</Svg>
          <span className="flex-1">{label}</span>
          {badge ? <span className={`rounded-full text-xs font-bold px-2 py-0.5 ${badge === "ON" ? "bg-emerald-400 text-emerald-950" : "bg-amber-500 text-slate-900"}`}>{badge}</span> : null}
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
        <div key={t.id} className={`rounded-xl px-4 py-3 text-sm shadow-lg text-white animate-rise ${t.tone === "error" ? "bg-red-600" : "bg-slate-900"}`}>
          {t.tone === "error" ? "⚠ " : "✓ "}{t.text}
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { overview, error, refresh, busy } = useConsole();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      {menu && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden animate-fade-in" onClick={() => setMenu(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300
                         ${menu ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="px-5 py-5">
          <div className="text-xl font-bold"><span className="text-amber-400">☀</span> Soorya</div>
          <div className="text-xs text-slate-400 mt-0.5">Maintenance console</div>
        </div>
        <div className="px-3 flex-1"><Nav onNavigate={() => setMenu(false)} /></div>
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
        <header className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
          <button onClick={() => setMenu(true)} className="lg:hidden rounded-lg p-1.5 hover:bg-slate-200" aria-label="Open menu">
            <Svg>{Icon.queue}</Svg>
          </button>
          <div className="text-sm text-slate-600 flex-1">
            {busy ? <span className="font-medium text-slate-900">{busy}</span>
                  : overview ? <>Data up to <b>{fmtDate(overview.as_of)}</b></> : "Loading…"}
          </div>
          <button onClick={refresh} className="text-sm text-slate-600 hover:text-slate-900">↻ Refresh</button>
          {busy && <div className="absolute left-0 right-0 bottom-0 h-0.5 overflow-hidden"><div className="h-full w-1/3 bg-amber-500 animate-[slide-bar_1.2s_ease-in-out_infinite]" /></div>}
        </header>
        <main key={pathname} className="p-4 lg:p-6 max-w-[1400px] animate-fade-in">
          {error ? (
            <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-red-800">
              Could not reach the server. Is the backend running? <span className="text-xs">({error})</span>
            </div>
          ) : <Outlet />}
        </main>
      </div>

      <SystemPanel />
      <NotifyDialog />
      <ScheduleDialog />
      <CompleteDialog />
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
