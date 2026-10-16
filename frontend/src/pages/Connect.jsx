import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import FileDrop from "../components/FileDrop.jsx";

const HOW_TO = [
  ["Growatt (ShinePhone / ShineServer)", "Plant → Energy → choose a date range → Export"],
  ["Solis (SolisCloud)", "Plant → Inverter → History → Export data"],
  ["Deye (SolarmanPV / Solarman Smart)", "Plant → Statistics / Report → Export"],
];

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400";

export default function Connect() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ owner_name: "", location: "Kochi", capacity_kw: "", install_date: "", warranty_until: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api("/locations").then(setLocations).catch(() => {}); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ready = file && form.owner_name && form.capacity_kw;

  const submit = async (demo = false) => {
    setError(null);
    setBusy(true);
    try {
      let result;
      if (demo) {
        result = await api("/systems/import/demo", { method: "POST" });
      } else {
        const body = new FormData();
        body.append("file", file);
        Object.entries(form).forEach(([k, v]) => v && body.append(k, v));
        result = await api("/systems/import", { method: "POST", body });
      }
      navigate(`/system/${result.system_id}`);
    } catch (e) {
      // API errors come back as {"detail": "..."}; show the plain message
      const detail = e.message.match(/"detail":"([^"]+)"/)?.[1];
      setError(detail ?? e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold">Connect your solar system</h1>
        <p className="text-slate-600 mt-2">
          Your inverter app already records how much your panels make. Export it and upload it here.
          No new hardware, no technician visit. We compare every day with what the sun allowed on your roof.
        </p>
        <button onClick={() => submit(true)} disabled={busy}
                className="mt-3 text-sm text-amber-700 underline underline-offset-2">
          No export handy? Try with a sample from a 4 kW system in Kochi
        </button>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-lg">1. Export from your inverter app</h2>
        <ul className="text-sm space-y-1">
          {HOW_TO.map(([brand, steps]) => (
            <li key={brand}><b>{brand}:</b> <span className="text-slate-600">{steps}</span></li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          Daily reports and detailed (every few minutes) exports both work. Save as CSV. At least 2 weeks of data.
        </p>
        <FileDrop label="Upload the CSV" hint="Daily or detailed export, .csv" busy={busy} done={!!file}
                  onFile={setFile} accept=".csv,text/csv" busyText="Checking your data…" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-lg">2. About your system</h2>
        <div className="grid gap-4 sm:grid-cols-2 mt-3">
          <Field label="Name for this system">
            <input className={input} value={form.owner_name} onChange={set("owner_name")} placeholder="e.g. Home, Kochi" />
          </Field>
          <Field label="Area">
            <select className={input} value={form.location} onChange={set("location")}>
              {locations.map((l) => <option key={l.name} value={l.name}>{l.name} ({l.district})</option>)}
            </select>
          </Field>
          <Field label="System size (kW)" hint="Printed on your quote or inverter">
            <input className={input} type="number" step="0.1" value={form.capacity_kw} onChange={set("capacity_kw")} />
          </Field>
          <Field label="Installed on (optional)">
            <input className={input} type="date" value={form.install_date} onChange={set("install_date")} />
          </Field>
          <Field label="Workmanship warranty until (optional)" hint="So we can tell you if a fault is still covered">
            <input className={input} type="date" value={form.warranty_until} onChange={set("warranty_until")} />
          </Field>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 text-sm">{error}</div>}

      <button onClick={() => submit(false)} disabled={!ready || busy}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white px-6 py-3 rounded-lg font-semibold">
        {busy ? "Checking your system…" : "Check my system"}
      </button>
    </div>
  );
}
