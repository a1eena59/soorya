import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageTitle } from "./Layout.jsx";
import { Card, Kpi, PageSkeleton } from "./ui.jsx";

const NAMES = {
  healthy: "Healthy", weather_dip: "Weather dip", soiling: "Dust", string_failure: "String offline", inverter_off: "Inverter off",
};
const FEATURES = {
  min_7: "Worst day this week", vs_peers_7: "Compared with neighbours", rolling_mean_7: "Average health this week",
  peer_median_7: "Neighbours' health", days_since_heavy_rain: "Days since heavy rain", zero_days_7: "Zero-output days",
  change_vs_30: "Change vs previous month", change_vs_prev_7: "Change vs last week", std_7: "Day-to-day swings",
  rain_mm_7: "Rain this week", slope_7: "Trend within the week", rain_recovery: "Recovery after rain",
};

export default function Detection() {
  const [m, setM] = useState(null);
  useEffect(() => { api("/model/stats").then(setM); }, []);
  if (!m) return <PageSkeleton />;
  const max = Math.max(...m.confusion_matrix.flat());
  const topImportance = m.feature_importance[0].importance;

  return (
    <div className="space-y-6">
      <PageTitle title="Detection accuracy"
                 sub="How well the fault classifier separates real faults from weather. Evaluated on roofs it never saw during training." />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Accuracy on unseen roofs" value={`${(m.accuracy * 100).toFixed(1)}%`} sub={`5-fold, grouped by system · ${m.rows.toLocaleString("en-IN")} system-days`} />
        <Kpi label="String failure precision" value={`${Math.round(m.per_class.string_failure.precision * 100)}%`} sub="When we say 'send a technician', how often it's real" />
        <Kpi label="Weather correctly ignored" value={`${Math.round(m.per_class.weather_dip.recall * 100)}%`} sub="Local-weather days recognised as weather" />
        <Kpi label="Held-out demo roof" value={`${(m.hero_accuracy * 100).toFixed(1)}%`} sub="SYS-001, never used in training" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Confusion matrix (days)">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left text-slate-500 font-normal">Actual ↓ / Predicted →</th>
                  {m.classes.map((c) => <th key={c} className="p-2 font-semibold">{NAMES[c]}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.confusion_matrix.map((row, i) => (
                  <tr key={i}>
                    <th className="p-2 text-left font-semibold">{NAMES[m.classes[i]]}</th>
                    {row.map((v, j) => {
                      const t = Math.sqrt(v / max);
                      return (
                        <td key={j} className="p-2 text-center tabular-nums rounded"
                            style={{ background: `rgba(42,120,214,${(t * 0.85).toFixed(2)})`, color: t > 0.5 ? "#fff" : "#0f172a",
                                     outline: i === j ? "2px solid #0f172a" : "none", outlineOffset: "-2px" }}
                            title={`Actually ${NAMES[m.classes[i]]}, predicted ${NAMES[m.classes[j]]}: ${v} days`}>
                          {v.toLocaleString("en-IN")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2">Diagonal (outlined) = correct. Alerts additionally require a fault to persist for days, which removes most single-day mistakes.</p>
        </Card>

        <Card title="What the model looks at">
          <ul className="space-y-2">
            {m.feature_importance.map((f) => (
              <li key={f.feature} className="text-sm">
                <div className="flex justify-between"><span>{FEATURES[f.feature] ?? f.feature}</span><span className="tabular-nums text-slate-500">{(f.importance * 100).toFixed(1)}%</span></div>
                <div className="h-1.5 rounded-full bg-slate-100 mt-1">
                  <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(f.importance / topImportance) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Per fault type">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2">Type</th><th>Precision</th><th>Recall</th><th>Days</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {m.classes.map((c) => (
              <tr key={c}>
                <td className="py-2 font-medium">{NAMES[c]}</td>
                <td className="tabular-nums">{Math.round(m.per_class[c].precision * 100)}%</td>
                <td className="tabular-nums">{Math.round(m.per_class[c].recall * 100)}%</td>
                <td className="tabular-nums">{m.per_class[c].support.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-3">
          Trained and evaluated on a simulated fleet built on real 2025 satellite weather for 14 Kerala locations.
          Measuring this on real installer fleets is the pilot goal.
        </p>
      </Card>
    </div>
  );
}
