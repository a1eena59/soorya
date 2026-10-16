import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function Home() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api("/health").then(setStatus).catch((e) => setStatus({ api: "error", detail: e.message }));
  }, []);

  return (
    <div className="space-y-8">
      <section className="text-center py-10">
        <h1 className="text-4xl font-bold">Is your rooftop solar actually working?</h1>
        <p className="text-slate-600 mt-3">
          Check an installer's quote before you sign. Verify your system's output after you install.
        </p>
        <div className="flex flex-wrap justify-center gap-4 mt-8">
          <Link to="/audit" className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-lg font-semibold">
            Check my quote
          </Link>
          <Link to="/system/1" className="bg-white border border-slate-300 px-6 py-3 rounded-lg font-semibold">
            Monitor my system
          </Link>
          <Link to="/installer" className="bg-white border border-slate-300 px-6 py-3 rounded-lg font-semibold">
            Installer dashboard
          </Link>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 text-sm">
        <h2 className="font-semibold mb-2">Backend status</h2>
        <pre className="text-slate-600 whitespace-pre-wrap">{status ? JSON.stringify(status, null, 2) : "Checking..."}</pre>
      </section>
    </div>
  );
}
