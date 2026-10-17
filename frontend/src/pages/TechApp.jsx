import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

const FAULT = { soiling: "Dust", string_failure: "String offline", inverter_off: "Inverter off" };
const fmtDay = (d) => new Date(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

function Report({ stop, causes, onDone }) {
  const options = stop.job === "cleaning" ? causes.soiling : causes[stop.fault] ?? Object.values(causes).flat();
  const [outcome, setOutcome] = useState("fixed");
  const [cause, setCause] = useState(options[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    await api(`/installer/work-orders/${stop.id}/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, cause: outcome === "fixed" ? cause : null, note: note || null }),
    });
    onDone(outcome === "fixed" ? "Reported fixed. Thanks!" : "Reported. A follow-up visit will be booked.");
  };

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <div className="grid grid-cols-2 gap-2">
        {[["fixed", "✓ Fixed"], ["not_fixed", "✗ Couldn't fix"]].map(([v, l]) => (
          <button key={v} onClick={() => setOutcome(v)}
                  className={`rounded-xl py-3 font-semibold ring-1 ${outcome === v ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-300"}`}>{l}</button>
        ))}
      </div>
      {outcome === "fixed" && (
        <select value={cause} onChange={(e) => setCause(e.target.value)} className="w-full rounded-xl ring-1 ring-slate-300 px-3 py-3 bg-white">
          {[...options, "Other"].map((c) => <option key={c}>{c}</option>)}
        </select>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={outcome === "fixed" ? "Note (optional)" : "What's needed? e.g. part to order"}
             className="w-full rounded-xl ring-1 ring-slate-300 px-3 py-3" />
      <button onClick={send} disabled={busy || (outcome === "not_fixed" && !note)}
              className="w-full rounded-xl bg-amber-500 text-white py-3 font-semibold disabled:opacity-50">
        {busy ? "Sending…" : "Send report"}
      </button>
    </div>
  );
}

// Technician's phone: today's route in order, job card, report back
export default function TechApp() {
  const { name } = useParams();
  const [techs, setTechs] = useState([]);
  const [jobs, setJobs] = useState(null);
  const [open, setOpen] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(() => { if (name) api(`/technicians/${encodeURIComponent(name)}/jobs`).then(setJobs); }, [name]);
  useEffect(() => { api("/technicians").then(setTechs); }, []);
  useEffect(() => { setJobs(null); load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="font-bold"><span className="text-amber-400">☀</span> Soorya · Field</div>
          {name && <Link to="/tech" className="text-sm text-slate-300">{name} ▾</Link>}
        </div>
      </header>
      <main className="max-w-md mx-auto p-4 space-y-3">
        {!name && (
          <>
            <h1 className="text-xl font-bold">Who are you?</h1>
            {techs.map((t) => (
              <Link key={t.name} to={`/tech/${encodeURIComponent(t.name)}`}
                    className="block rounded-2xl bg-white ring-1 ring-slate-200 p-4 font-semibold">
                🔧 {t.name} <span className="font-normal text-slate-500">· {t.base}</span>
              </Link>
            ))}
          </>
        )}
        {flash && <div className="rounded-xl bg-emerald-100 text-emerald-900 px-4 py-3 font-medium animate-rise">✓ {flash}</div>}
        {name && !jobs && <div className="skeleton h-40" />}
        {jobs && jobs.days.length === 0 && <p className="text-slate-500 text-center py-10">No visits booked. 🎉</p>}
        {jobs?.days.map((d) => (
          <section key={d.day}>
            <h2 className="font-semibold mt-2">{fmtDay(d.day)}</h2>
            <p className="text-sm text-slate-500">From {d.base} · {d.stops.length} stops · about {d.km} km</p>
            <ol className="mt-2 space-y-2">
              {d.stops.map((s, i) => (
                <li key={s.id} className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
                  <button className="w-full text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{s.owner_name}</div>
                        <div className="text-sm text-slate-500">{s.location} · {s.job === "cleaning" ? "Cleaning" : FAULT[s.fault] ?? "Check"} · {s.km_from_previous} km</div>
                      </div>
                    </div>
                  </button>
                  {open === s.id && (
                    <div className="mt-3 text-sm space-y-2">
                      <p className="text-slate-700">{s.notes}</p>
                      <div className="flex gap-2">
                        <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="flex-1 text-center rounded-xl ring-1 ring-slate-300 py-2 font-medium">📞 Call</a>
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`} target="_blank" rel="noreferrer"
                           className="flex-1 text-center rounded-xl ring-1 ring-slate-300 py-2 font-medium">🧭 Navigate</a>
                      </div>
                      <Report stop={s} causes={jobs.causes} onDone={(m) => { setFlash(m); setOpen(null); load(); }} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </main>
    </div>
  );
}
