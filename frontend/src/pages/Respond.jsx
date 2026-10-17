import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const LABELS = { done: "Done", book_cleaning: "Book cleaning", call_me: "Call me", confirm: "Confirm", another_day: "Another day" };

export async function sendResponse(token, action) {
  return api(`/respond/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
  });
}

// Opened from the buttons in the owner's email
export default function Respond() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [ticket, setTicket] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const sent = useRef(false);

  const act = async (action) => {
    try {
      setResult(await sendResponse(token, action));
    } catch (e) {
      setError(e.message.match(/"detail":"([^"]+)"/)?.[1] ?? e.message);
    }
  };

  useEffect(() => {
    api(`/respond/${token}`).then((t) => {
      setTicket(t);
      const a = params.get("action");
      if (a && !sent.current && t.actions.includes(a)) { sent.current = true; act(a); }
    }).catch(() => setError("This link is not valid."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="max-w-md mx-auto py-10">
      <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center animate-rise">
        <div className="text-4xl">{result ? "✅" : error ? "⚠️" : "☀"}</div>
        {ticket && <h1 className="text-xl font-bold mt-3">{ticket.owner_name}</h1>}
        {result && <p className="mt-3 text-lg">{result.message}</p>}
        {error && <p className="mt-3 text-red-700">{error}</p>}
        {!result && !error && ticket && (
          ticket.actions.length ? (
            <>
              <p className="mt-3 text-slate-600">About: {ticket.fault}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {ticket.actions.map((a, i) => (
                  <button key={a} onClick={() => act(a)}
                          className={`rounded-xl px-5 py-2.5 font-semibold transition ${i === 0 ? "bg-amber-500 hover:bg-amber-600 text-white" : "ring-1 ring-slate-300 hover:bg-slate-50"}`}>
                    {LABELS[a]}
                  </button>
                ))}
              </div>
            </>
          ) : <p className="mt-3 text-slate-600">Nothing needed from you right now. Thank you!</p>
        )}
        <Link to="/customer" className="inline-block mt-8 text-sm text-slate-500 hover:text-slate-900">Open Soorya →</Link>
      </div>
    </div>
  );
}
