import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Chip, HealthBar, LANES, LaneBadge, Sparkline, WarrantyChip, rupees, shortDate } from "./ui.jsx";

const SORTS = {
  priority: () => 0,
  health: (a, b) => (a.health_pct ?? 999) - (b.health_pct ?? 999),
  loss: (a, b) => (b.issue?.rupees_per_month ?? 0) - (a.issue?.rupees_per_month ?? 0),
  name: (a, b) => (a.owner_name ?? "").localeCompare(b.owner_name ?? ""),
  area: (a, b) => a.location.localeCompare(b.location),
};

function exportCsv(rows) {
  const head = ["system", "customer", "area", "kw", "health_pct", "status", "issue", "rupees_per_month", "warranty_until", "phone", "email"];
  const lines = rows.map((s) => [s.name, s.owner_name, s.location, s.capacity_kw, s.health_pct, LANES[s.lane].label,
    s.issue?.name ?? "", s.issue?.rupees_per_month ?? "", s.warranty_until ?? "", s.phone, s.email]
    .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "soorya-fleet.csv" });
  a.click();
}

export default function Fleet() {
  const { fleet, openSystem, schedule, notify } = useConsole();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("priority");
  const area = params.get("area") ?? "";
  const lane = params.get("lane") ?? "";
  const under = params.get("under") === "1";

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p);
  };

  const rows = useMemo(() => {
    if (!fleet) return [];
    const needle = q.toLowerCase();
    return fleet
      .filter((s) => !area || s.location === area)
      .filter((s) => !lane || s.lane === lane)
      .filter((s) => !under || (s.health_pct ?? 100) < 90)
      .filter((s) => !needle || [s.owner_name, s.name, s.location, s.phone, s.email].some((v) => v?.toLowerCase().includes(needle)))
      .sort(SORTS[sort]);
  }, [fleet, q, area, lane, under, sort]);

  if (!fleet) return <p className="text-slate-500">Loading…</p>;
  const areas = [...new Set(fleet.map((s) => s.location))].sort();
  const counts = Object.fromEntries(Object.keys(LANES).map((l) => [l, fleet.filter((s) => s.lane === l).length]));

  return (
    <div>
      <PageTitle title="Fleet" sub="Every system you maintain. Click a row for the full diagnosis."
                 actions={<Button onClick={() => exportCsv(rows)}>Export CSV</Button>} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, system, phone…"
               className="rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm bg-white w-64" />
        <select value={area} onChange={(e) => set("area", e.target.value)} className="rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">All areas</option>
          {areas.map((a) => <option key={a}>{a}</option>)}
        </select>
        <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden text-sm bg-white">
          <button onClick={() => set("lane", "")} className={`px-3 py-2 ${!lane ? "bg-slate-900 text-white" : ""}`}>All {fleet.length}</button>
          {Object.entries(LANES).map(([key, l]) => (
            <button key={key} onClick={() => set("lane", key)}
                    className={`px-3 py-2 border-l border-slate-200 ${lane === key ? "bg-slate-900 text-white" : ""}`}>
              <span style={{ color: lane === key ? undefined : l.color }}>{l.icon}</span> {l.short} {counts[key]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm bg-white rounded-lg ring-1 ring-slate-300 px-3 py-2">
          <input type="checkbox" checked={under} onChange={(e) => set("under", e.target.checked ? "1" : "")} />
          Underperforming only (&lt; 90%)
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm bg-white">
          <option value="priority">Sort: priority</option>
          <option value="health">Sort: lowest health</option>
          <option value="loss">Sort: biggest ₹ loss</option>
          <option value="name">Sort: customer</option>
          <option value="area">Sort: area</option>
        </select>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Area</th>
              <th className="px-4 py-3 font-semibold">Health (7 d)</th>
              <th className="px-4 py-3 font-semibold">Last 30 days</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Problem</th>
              <th className="px-4 py-3 font-semibold text-right">Loss / mo</th>
              <th className="px-4 py-3 font-semibold">Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} onClick={() => openSystem(s.id)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.owner_name}</div>
                  <div className="text-xs text-slate-500">{s.name} · {s.capacity_kw} kW</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{s.location}</td>
                <td className="px-4 py-3"><HealthBar pct={s.health_pct} /></td>
                <td className="px-4 py-3"><Sparkline values={s.spark} color={LANES[s.lane].color} /></td>
                <td className="px-4 py-3"><LaneBadge lane={s.lane} /></td>
                <td className="px-4 py-3">
                  {s.issue ? (
                    <div>
                      <div>{s.issue.name}</div>
                      <div className="text-xs text-slate-500">since {shortDate(s.issue.start_date)}</div>
                      <div className="mt-1"><WarrantyChip covered={s.warranty_covered} /></div>
                    </div>
                  ) : <span className="text-slate-400">–</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{s.issue ? rupees(s.issue.rupees_per_month) : "–"}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {s.lane === "technician" && (s.work_order
                    ? <Chip tone="green">🔧 {s.work_order.technician.split(" ")[0]}, {shortDate(s.work_order.scheduled_date)}</Chip>
                    : <Button size="sm" variant="dark" onClick={() => schedule(s)}>Schedule</Button>)}
                  {s.lane === "customer" && (s.last_notified
                    ? <Chip tone="blue">✉ Reminded</Chip>
                    : <Button size="sm" variant="primary" onClick={() => notify(s, "clean_panels")}>Remind</Button>)}
                  {(s.lane === "watch" || s.lane === "healthy") && <span className="text-xs text-slate-400">No action</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No systems match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-2">{rows.length} of {fleet.length} systems</p>
    </div>
  );
}
