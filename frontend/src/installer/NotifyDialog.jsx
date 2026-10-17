import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { Button, Dialog, KINDS } from "./ui.jsx";

export default function NotifyDialog() {
  const { notifyFor, closeNotify, refresh, toast, autopilot } = useConsole();
  const live = autopilot?.delivery.telegram || autopilot?.delivery.email;
  const [channel, setChannel] = useState("sms");
  const [kind, setKind] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = notifyFor?.system;

  useEffect(() => {
    if (!notifyFor) return;
    setChannel("sms");
    setKind(notifyFor.kind ?? null);
  }, [notifyFor]);

  useEffect(() => {
    if (!s) return;
    setDraft(null);
    const q = new URLSearchParams({ channel, ...(kind ? { kind } : {}) });
    api(`/installer/systems/${s.id}/compose?${q}`).then((d) => { setDraft(d); setKind(d.kind); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, channel, kind]);

  const send = async () => {
    setBusy(true);
    try {
      const r = await api("/installer/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_id: s.id, channel, kind: draft.kind, message: draft.message, subject: draft.subject }),
      });
      toast(r.status === "sent" ? `Delivered to your ${r.delivered_via} (demo customer: ${s.owner_name})`
            : r.status === "failed" ? `Saved, but delivery failed: ${r.error}`
            : `${channel === "sms" ? "SMS" : "Email"} to ${s.owner_name} saved (demo, not delivered)`, r.status === "failed" ? "error" : "ok");
      closeNotify();
      refresh();
    } catch (e) {
      toast(`Could not send: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const segments = draft && channel === "sms" ? Math.ceil(draft.message.length / 160) : 0;

  return (
    <Dialog open={!!notifyFor} onClose={closeNotify} title={`Message ${s?.owner_name ?? ""}`}
            footer={<>
              <Button onClick={closeNotify}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={!draft || busy}>
                {busy ? "Sending…" : `Send ${channel === "sms" ? "SMS" : "email"}`}
              </Button>
            </>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-sky-50 ring-1 ring-sky-200 px-3 py-2 text-xs text-sky-900">
          {live ? "Live: this demo customer's message will arrive on your Telegram / inbox."
                : "Demo mode: saved to the outbox, not delivered. Set up Telegram or email (README) to receive it live."}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden text-sm">
            {["sms", "email"].map((c) => (
              <button key={c} onClick={() => setChannel(c)}
                      className={`px-3 py-1.5 font-medium ${channel === c ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}>
                {c === "sms" ? "SMS" : "Email"}
              </button>
            ))}
          </div>
          <select value={kind ?? ""} onChange={(e) => setKind(e.target.value)}
                  className="rounded-lg ring-1 ring-slate-300 px-3 py-1.5 text-sm bg-white">
            {Object.entries(KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        {!draft ? <p className="text-sm text-slate-500">Preparing message…</p> : (
          <>
            <div className="text-sm"><span className="text-slate-500">To:</span> <b>{draft.recipient}</b></div>
            {channel === "email" && (
              <input value={draft.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                     className="w-full rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm font-medium" />
            )}
            <textarea value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                      rows={channel === "sms" ? 5 : 11}
                      className="w-full rounded-lg ring-1 ring-slate-300 px-3 py-2 text-sm leading-relaxed" />
            {channel === "sms" && (
              <p className={`text-xs ${segments > 2 ? "text-amber-700" : "text-slate-500"}`}>
                {draft.message.length} characters · {segments} SMS{segments > 1 ? " segments" : ""}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
