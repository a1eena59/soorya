import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { units } from "../format.js";

// Validated pair (colorblind-safe, ≥3:1 on the surface)
const USED = "#2a78d6";
const EXPORTED = "#eb6834";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow">
      <div className="font-semibold">{label}</div>
      <div><span className="inline-block w-2 h-2 rounded-sm mr-2" style={{ background: USED }} />Used at home: {units(d.self_used)} units</div>
      <div><span className="inline-block w-2 h-2 rounded-sm mr-2" style={{ background: EXPORTED }} />Exported to KSEB: {units(d.exported)} units</div>
    </div>
  );
}

export default function GenerationChart({ quoted, recommended, usage }) {
  const data = [
    { name: `This quote (${quoted.advertised_kw ?? quoted.kw} kW)`, self_used: quoted.self_used, exported: quoted.exported },
    { name: `Right size (${recommended.kw} kW)`, self_used: recommended.self_used, exported: recommended.exported },
  ];

  return (
    <figure>
      <figcaption className="font-semibold">Where the electricity goes, per year</figcaption>
      <div className="flex flex-wrap gap-4 text-sm text-slate-600 mt-1">
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: USED }} />Used at home: saves full tariff</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: EXPORTED }} />Exported: KSEB pays much less</span>
        <span><span className="inline-block w-4 mr-1 align-middle border-t-2 border-dashed border-slate-600" />Your usage: {units(usage)} units</span>
      </div>
      <div className="h-64 mt-2">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="name" tick={{ fill: "#52514e", fontSize: 13 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false}
                   tickFormatter={(v) => units(v)} width={56} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <ReferenceLine y={usage} stroke="#52514e" strokeDasharray="4 4" />
            <Bar dataKey="self_used" stackId="a" fill={USED} stroke="#fff" strokeWidth={2} />
            <Bar dataKey="exported" stackId="a" fill={EXPORTED} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="exported" position="top" fill="#52514e" fontSize={12}
                         formatter={(v) => (v >= 50 ? `${units(v)} exported` : "")} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
