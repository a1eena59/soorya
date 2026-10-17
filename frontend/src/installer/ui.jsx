import { useEffect } from "react";

// Status palette: reserved for state, always shown with an icon + label (never colour alone)
export const LANES = {
  technician: { label: "Needs technician", short: "Technician", icon: "▲", color: "#dc2626",
                chip: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-600" },
  customer: { label: "Customer can fix", short: "Customer fix", icon: "◆", color: "#d97706",
              chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  watch: { label: "Watching", short: "Watching", icon: "●", color: "#0284c7",
           chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-600" },
  healthy: { label: "Healthy", short: "Healthy", icon: "✓", color: "#059669",
             chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-600" },
};

export const KINDS = {
  clean_panels: "Clean your panels",
  fault_found: "Fault found",
  visit_scheduled: "Visit scheduled",
  check_in: "All good check-in",
};
// Messages the agent sends (shown in the outbox, not offered as manual templates)
export const AGENT_KINDS = {
  owner_action: "Owner can fix", data_fix: "Data missing", reminder: "Reminder", visit: "Visit booked",
  visit_reminder: "Visit tomorrow", closed_ok: "Fixed, all good",
};
export const kindLabel = (k) => KINDS[k] ?? AGENT_KINDS[k] ?? k;

export const rupees = (n) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
export const fmtDate = (d, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  d ? new Date(d).toLocaleDateString("en-IN", opts) : "–";
export const shortDate = (d) => fmtDate(d, { day: "numeric", month: "short" });

export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function LaneBadge({ lane, size = "sm" }) {
  const l = LANES[lane];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 font-medium whitespace-nowrap
                      ${size === "sm" ? "text-xs" : "text-sm"} ${l.chip}`}>
      <span aria-hidden>{l.icon}</span>{l.label}
    </span>
  );
}

export function Chip({ children, tone = "slate", title }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function WarrantyChip({ covered }) {
  if (covered == null) return null;
  return covered
    ? <Chip tone="violet" title="Fault started inside your workmanship warranty: the visit is on you">Warranty: your cost</Chip>
    : <Chip tone="slate" title="Workmanship warranty has ended: the visit is billable">Out of warranty: billable</Chip>;
}

export function HealthBar({ pct }) {
  if (pct == null) return <span className="text-slate-400">–</span>;
  const tone = pct >= 90 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 w-14 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="tabular-nums text-sm font-medium">{pct}%</span>
    </div>
  );
}

export function Sparkline({ values, width = 96, height = 28, color = "#2a78d6" }) {
  if (!values?.length) return null;
  const lo = Math.min(60, ...values), hi = Math.max(105, ...values);
  const x = (i) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v) => height - 2 - ((v - lo) / (hi - lo)) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label={`Last 30 days, now ${values.at(-1)}%`}>
      <line x1="2" x2={width - 2} y1={y(100)} y2={y(100)} stroke="#cbd5e1" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1))} r="2.5" fill={color} />
      <title>{`Health over last 30 days: ${values[0]}% → ${values.at(-1)}% (dashed line = 100% of what the sun allowed)`}</title>
    </svg>
  );
}

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm animate-rise ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5 pt-3">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone, icon, onClick }) {
  const accent = tone ? LANES[tone]?.color : null;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
         className={`text-left rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 animate-rise
                     ${onClick ? "hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300 transition duration-200" : ""}`}>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon && <span style={{ color: accent ?? undefined }} aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="text-3xl font-bold tracking-tight mt-1 tabular-nums" style={{ color: accent ?? undefined }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </Tag>
  );
}

export function Button({ children, variant = "secondary", size = "md", className = "", ...props }) {
  const variants = {
    primary: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm",
    dark: "bg-slate-900 hover:bg-slate-800 text-white shadow-sm",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
    secondary: "bg-white ring-1 ring-slate-300 hover:bg-slate-50 text-slate-800",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  return (
    <button {...props}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100
                        ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

export function Drawer({ open, onClose, children }) {
  useEscape(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 animate-fade-in" onClick={onClose} />
      <aside className="relative h-full w-full max-w-2xl bg-slate-50 shadow-2xl overflow-y-auto animate-slide-in">{children}</aside>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer }) {
  useEscape(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-pop">
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pb-4">{footer}</div>}
      </div>
    </div>
  );
}

export const Icon = {
  dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
  queue: <path d="M4 6h16M4 12h16M4 18h10" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" />,
  fleet: <path d="M3 5h18v4H3zM3 11h18v4H3zM3 17h18v2H3z" />,
  visits: <path d="M7 2v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z" />,
  messages: <path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2z" />,
  detection: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  customer: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-8 8a8 8 0 0116 0H4z" />,
};

export function Svg({ children, className = "w-5 h-5" }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>{children}</svg>;
}

export function Skeleton({ className = "h-24" }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Skeleton className="h-96 xl:col-span-3" />
        <Skeleton className="h-96 xl:col-span-2" />
      </div>
    </div>
  );
}

// Small (i) that explains a term on hover / focus
export function Info({ text }) {
  return (
    <span tabIndex={0} title={text} aria-label={text}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold cursor-help align-middle">
      i
    </span>
  );
}

Icon.map = <path d="M9 3L3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5L9 3zm0 2.2l6 2.5v11.1l-6-2.5V5.2z" />;

Icon.autopilot = <path d="M12 2a2 2 0 012 2v1h3a3 3 0 013 3v8a3 3 0 01-3 3H7a3 3 0 01-3-3V8a3 3 0 013-3h3V4a2 2 0 012-2zM9 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM2 10h1v5H2zm19 0h1v5h-1z" />;

export function Switch({ on, onChange, disabled }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50
                        ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export function ByAutopilot({ who }) {
  return who === "agent" || who === "autopilot" ? <Chip tone="violet" title="Done by the Soorya agent">🤖 Agent</Chip> : null;
}

export const DELIVERY = {
  sent: { label: "Delivered", tone: "green" },
  logged_demo: { label: "Logged (demo)", tone: "slate" },
  failed: { label: "Failed", tone: "red" },
};

export const FAULT_SHORT = {
  soiling: "Dust", string_failure: "String offline", inverter_off: "Inverter off", data_gap: "No data",
};

export const STAGES = {
  waiting: { label: "Waiting for rain", icon: "🌧" },
  owner: { label: "Owner fixing", icon: "🏠" },
  callback: { label: "Call the owner", icon: "📞" },
  verifying: { label: "Checking the fix", icon: "🔍" },
  technician: { label: "Technician", icon: "🔧" },
  closed: { label: "Closed", icon: "✓" },
};

// One clear control: a big "Turn on" when off, a green status + small "Turn off" when on
export function AgentToggle({ on, onChange, disabled, size = "md" }) {
  if (on) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-800 px-3 py-1.5 text-sm font-semibold">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </span>
          Agent on
        </span>
        <button onClick={() => onChange(false)} disabled={disabled}
                className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-50">Turn off</button>
      </span>
    );
  }
  return (
    <button onClick={() => onChange(true)} disabled={disabled}
            className={`inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-sm
                        transition active:scale-[0.98] disabled:opacity-50 ${size === "lg" ? "px-5 py-3" : "px-4 py-2 text-sm"}`}>
      <span aria-hidden>▶</span> Turn on agent
    </button>
  );
}
