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
    <section className={`rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm ${className}`}>
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
         className={`text-left rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 ${onClick ? "hover:ring-slate-300 hover:shadow transition" : ""}`}>
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
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold disabled:opacity-50
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
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative h-full w-full max-w-2xl bg-slate-50 shadow-2xl overflow-y-auto">{children}</aside>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer }) {
  useEscape(onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
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
