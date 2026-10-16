import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ACTUAL = "#2a78d6";      // validated series colour
const EXPECTED = "#52514e";    // neutral reference (what the sun allowed)
const FAULT_FILL = "#e34948";

const LABELS = {
  healthy: "Healthy",
  weather_dip: "Low because of local weather",
  soiling: "Dust building up",
  string_failure: "Panel string offline",
  inverter_off: "Inverter not producing",
};

const fmtDay = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// 7-day average smooths out single cloudy days, the same window the fault detector uses
export function smooth(rows) {
  return rows.map((r, i) => {
    const w = rows.slice(Math.max(0, i - 6), i + 1);
    const avg = (k) => w.reduce((s, x) => s + x[k], 0) / w.length;
    return { ...r, actual_7: avg("actual_kwh"), expected_7: avg("expected_kwh") };
  });
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow">
      <div className="font-semibold">{new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
      <div>Made: <b>{d.actual_kwh.toFixed(1)} units</b></div>
      <div>Sun allowed: {d.expected_kwh.toFixed(1)} units</div>
      <div>Rain: {d.rain_mm?.toFixed(0) ?? "–"} mm</div>
      {d.label && <div className="text-slate-500 mt-1">{LABELS[d.label] ?? d.label}</div>}
    </div>
  );
}

export default function HealthChart({ rows, faults = [] }) {
  const data = smooth(rows);
  const first = data[0]?.day;
  const last = data[data.length - 1]?.day;

  return (
    <figure>
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span><span className="inline-block w-4 mr-1 align-middle border-t-2" style={{ borderColor: ACTUAL }} />What your panels made</span>
        <span><span className="inline-block w-4 mr-1 align-middle border-t-2 border-dashed" style={{ borderColor: EXPECTED }} />What the sun allowed</span>
        {faults.length > 0 && (
          <span><span className="inline-block w-3 h-3 mr-1 align-middle rounded-sm" style={{ background: FAULT_FILL, opacity: 0.18 }} />Problem detected</span>
        )}
      </div>
      <div className="h-72 mt-2">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="day" tickFormatter={fmtDay} minTickGap={40}
                   tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} width={40}
                   label={{ value: "units/day", angle: -90, position: "insideLeft", fill: "#52514e", fontSize: 12 }} />
            {faults.map((f) => {
              const x1 = f.start_date < first ? first : f.start_date;
              const x2 = f.end_date && f.end_date < last ? f.end_date : last;
              return x1 <= last && x2 >= first ? (
                <ReferenceArea key={f.id} x1={x1} x2={x2} fill={FAULT_FILL} fillOpacity={0.1} ifOverflow="hidden" />
              ) : null;
            })}
            <Tooltip content={<Tip />} cursor={{ stroke: "#a8a29e", strokeWidth: 1 }} />
            <Line dataKey="expected_7" stroke={EXPECTED} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="actual_7" stroke={ACTUAL} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-slate-500 mt-1">7-day average, units per day. Hover for each day's numbers.</figcaption>
    </figure>
  );
}
