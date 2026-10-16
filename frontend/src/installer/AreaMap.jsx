import { useState } from "react";
import { LANES } from "./ui.jsx";

// Kerala bounding box: dots placed by real coordinates (no map tiles, works offline)
const BOX = { lonMin: 74.8, lonMax: 77.3, latMin: 8.3, latMax: 12.7 };
const W = 380, H = 470;
// Coastal towns get their label on the left (towards the sea) to keep the cluster readable
const LEFT = new Set(["Kochi", "Alappuzha", "Kollam", "Thiruvananthapuram", "Kozhikode", "Kannur", "Kasaragod"]);
const px = (lon) => ((lon - BOX.lonMin) / (BOX.lonMax - BOX.lonMin)) * (W - 250) + 135;
const py = (lat) => H - 20 - ((lat - BOX.latMin) / (BOX.latMax - BOX.latMin)) * (H - 50);

function worst(a) {
  return a.technician ? "technician" : a.customer ? "customer" : a.watch ? "watch" : "healthy";
}

export default function AreaMap({ areas, onSelect }) {
  const [hover, setHover] = useState(null);
  const h = areas.find((a) => a.location === hover);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[460px]" role="img" aria-label="Systems by area">
        <text x="14" y={H / 2} fontSize="11" fill="#94a3b8" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">Arabian Sea</text>
        {areas.map((a) => {
          const lane = LANES[worst(a)];
          const r = 7 + Math.sqrt(a.systems) * 3;
          const issues = a.technician + a.customer;
          return (
            <g key={a.location} transform={`translate(${px(a.lon)},${py(a.lat)})`} className="cursor-pointer"
               onMouseEnter={() => setHover(a.location)} onMouseLeave={() => setHover(null)}
               onClick={() => onSelect?.(a.location)}>
              <circle r={r + 6} fill="transparent" />
              <circle r={r} fill={lane.color} opacity={hover === a.location ? 1 : 0.85} stroke="#fff" strokeWidth="2" />
              {issues > 0 && <text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#fff">{issues}</text>}
              <text x={LEFT.has(a.location) ? -(r + 5) : r + 5} dy="4" fontSize="11" fill="#334155" fontWeight="500"
                    textAnchor={LEFT.has(a.location) ? "end" : "start"}>{a.location}</text>
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="absolute top-2 right-2 rounded-xl bg-white ring-1 ring-slate-200 shadow-lg px-3 py-2 text-xs w-48">
          <div className="font-semibold text-sm">{h.location}</div>
          <div className="text-slate-500">{h.systems} systems · avg {h.avg_health}%</div>
          <div className="mt-1 space-y-0.5">
            {["technician", "customer", "watch", "healthy"].map((l) => h[l] > 0 && (
              <div key={l} className="flex justify-between">
                <span><span style={{ color: LANES[l].color }}>{LANES[l].icon}</span> {LANES[l].short}</span><b>{h[l]}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 mt-2">
        {["technician", "customer", "healthy"].map((l) => (
          <span key={l}><span style={{ color: LANES[l].color }}>●</span> {LANES[l].short}</span>
        ))}
        <span className="text-slate-400">Size = systems · number = open issues</span>
      </div>
    </div>
  );
}
