// Ring gauge for "how much of what the sun allowed did your panels make"
export default function Gauge({ pct, color, size = 148, label = "of what the sun allowed" }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(pct ?? 0, 100));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${pct}% ${label}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="12" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.2, 0.8, 0.2, 1)" }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-bold tabular-nums" style={{ color }}>{pct ?? "–"}%</div>
        <div className="text-[11px] leading-tight text-slate-500 max-w-[90px]">{label}</div>
      </div>
    </div>
  );
}
