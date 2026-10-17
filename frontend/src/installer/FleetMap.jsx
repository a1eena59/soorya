import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useConsole } from "./context.jsx";
import { LANES, rupees } from "./ui.jsx";

const KERALA = [[8.3, 75.2], [12.7, 77.2]];
const ORDER = ["healthy", "watch", "customer", "technician"];          // problems drawn on top

function FitTo({ bounds }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [24, 24] }); }, [map, bounds]);
  return null;
}

export default function FleetMap({ height = 460, filter = null, focusArea = null, showFilters = true }) {
  const { fleet, openSystem } = useConsole();
  const [lanes, setLanes] = useState(new Set(filter ?? ORDER));

  const shown = useMemo(() => (fleet ?? [])
    .filter((s) => lanes.has(s.lane) && (!focusArea || s.location === focusArea))
    .sort((a, b) => ORDER.indexOf(a.lane) - ORDER.indexOf(b.lane)), [fleet, lanes, focusArea]);

  const bounds = useMemo(() => {
    if (!focusArea || !shown.length) return KERALA;
    const lats = shown.map((s) => s.position[0]), lons = shown.map((s) => s.position[1]);
    return [[Math.min(...lats) - 0.03, Math.min(...lons) - 0.03], [Math.max(...lats) + 0.03, Math.max(...lons) + 0.03]];
  }, [focusArea, shown]);

  const toggle = (l) => {
    const next = new Set(lanes);
    next.has(l) ? next.delete(l) : next.add(l);
    setLanes(next);
  };

  if (!fleet) return <div className="skeleton" style={{ height }} />;

  return (
    <div>
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-3">
          {["technician", "customer", "watch", "healthy"].map((l) => {
            const n = fleet.filter((s) => s.lane === l && (!focusArea || s.location === focusArea)).length;
            const on = lanes.has(l);
            return (
              <button key={l} onClick={() => toggle(l)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition
                        ${on ? LANES[l].chip : "bg-white text-slate-400 ring-slate-200 line-through"}`}>
                <span className={`w-2 h-2 rounded-full ${LANES[l].dot} ${on ? "" : "opacity-30"}`} />
                {LANES[l].short} · {n}
              </button>
            );
          })}
        </div>
      )}
      <div className="rounded-xl overflow-hidden ring-1 ring-slate-200" style={{ height }}>
        <MapContainer bounds={KERALA} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}
                      attributionControl={true} zoomSnap={0.25}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={18} className="muted-tiles"
                     attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          <FitTo bounds={bounds} />
          {shown.map((s) => {
            const l = LANES[s.lane];
            const problem = s.lane === "technician" || s.lane === "customer";
            return (
              <CircleMarker key={s.id} center={s.position} radius={problem ? 6 + s.capacity_kw * 0.6 : 5 + s.capacity_kw * 0.4}
                            pathOptions={{ color: "#fff", weight: problem ? 2 : 1, fillColor: l.color, fillOpacity: problem ? 0.95 : 0.8 }}
                            eventHandlers={{ click: () => openSystem(s.id) }}>
                <Tooltip className="soorya-tip" direction="top" offset={[0, -6]}>
                  <div className="text-xs">
                    <div className="font-semibold text-sm">{s.owner_name}</div>
                    <div className="text-slate-500">{s.location} · {s.capacity_kw} kW · {s.health_pct}% health</div>
                    <div className="mt-1" style={{ color: l.color }}>{l.icon} {s.issue ? s.issue.name : l.label}</div>
                    {s.issue && <div>{rupees(s.issue.rupees_per_month)}/month being lost</div>}
                    <div className="text-slate-400 mt-1">Click for details</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Dot size = system size. Demo positions are approximate (spread around each district centre).
      </p>
    </div>
  );
}
