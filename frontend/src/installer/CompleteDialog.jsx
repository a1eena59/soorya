import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { Button, Dialog } from "./ui.jsx";

// Report a visit: fixed (with the ACTUAL cause, which the model learns from) or couldn't fix
export default function CompleteDialog() {
  const { completeFor: o, closeComplete, agent, refresh, toast } = useConsole();
  const [outcome, setOutcome] = useState("fixed");
  const [cause, setCause] = useState("");
  const [note, setNote] = useState("");
  const options = !o ? [] : o.job === "cleaning" ? agent?.causes.soiling ?? []
    : agent?.causes[o.label] ?? Object.values(agent?.causes ?? {}).flat();

  useEffect(() => { setOutcome("fixed"); setCause(options[0] ?? ""); setNote(""); }, [o?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    await api(`/installer/work-orders/${o.id}/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, cause: outcome === "fixed" ? cause : null, note: note || null }),
    });
    toast(outcome === "fixed" ? "Reported fixed. The agent will check the next days' output." : "Follow-up visit proposed.");
    closeComplete();
    refresh();
  };

  return (
    <Dialog open={!!o} onClose={closeComplete} title="Visit report"
            footer={<><Button onClick={closeComplete}>Cancel</Button>
              <Button variant="dark" onClick={save} disabled={outcome === "fixed" ? !cause : !note}>Save</Button></>}>
      {o && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{o.owner_name} · {o.location} · {o.technician}</p>
          <div className="grid grid-cols-2 gap-2">
            {[["fixed", "✓ Fixed"], ["not_fixed", "✗ Couldn't fix"]].map(([v, l]) => (
              <button key={v} onClick={() => setOutcome(v)}
                      className={`rounded-lg py-2 text-sm font-semibold ring-1 ${outcome === v ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-300"}`}>{l}</button>
            ))}
          </div>
          {outcome === "fixed" && (
            <select value={cause} onChange={(e) => setCause(e.target.value)} className="w-full rounded-lg ring-1 ring-slate-300 px-3 py-2 bg-white">
              {[...options, "Other"].map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder={outcome === "fixed" ? "Note (optional)" : "What's needed? e.g. part to order"}
                 className="w-full rounded-lg ring-1 ring-slate-300 px-3 py-2" />
        </div>
      )}
    </Dialog>
  );
}
