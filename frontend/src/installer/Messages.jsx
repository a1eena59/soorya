import { useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { AGENT_KINDS, ByAutopilot, Button, Card, Chip, KINDS, ago, fmtDate, kindLabel, PageSkeleton } from "./ui.jsx";

export default function Messages() {
  const { messages, fleet, openSystem, refresh, toast } = useConsole();
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState(null);
  if (!fleet) return <PageSkeleton />;

  const rows = messages.filter((m) => !kind || m.kind === kind);
  const unreminded = fleet.filter((s) => s.lane === "customer" && !s.last_notified).length;

  const remindAll = async () => {
    const r = await api("/installer/notify/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lane: "customer", channel: "sms" }),
    });
    toast(r.sent ? `${r.sent} cleaning reminders sent` : "Everyone was already reminded this week");
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Messages" sub={`${messages.length} SMS sent · demo outbox, not delivered`}
                 actions={unreminded > 0 && <Button variant="primary" onClick={remindAll}>Remind {unreminded} dust cases</Button>} />

      <Card title="Outbox" action={
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg ring-1 ring-slate-300 px-2 py-1 text-sm bg-white">
          <option value="">All types</option>
          {Object.entries({ ...AGENT_KINDS, ...KINDS }).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      }>
        {rows.length === 0 ? <p className="text-sm text-slate-500">No messages yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((m) => (
              <li key={m.id} className="py-3">
                <button className="w-full text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b>{m.owner_name}</b>
                    <span className="text-slate-500">{m.recipient}</span>
                    <Chip>{kindLabel(m.kind)}</Chip>
                    <ByAutopilot who={m.created_by} />
                    <span className="ml-auto text-xs text-slate-500" title={fmtDate(m.sent_at)}>{ago(m.sent_at)}</span>
                  </div>
                  <div className={`mt-1 text-sm text-slate-600 ${open === m.id ? "whitespace-pre-line" : "line-clamp-1"}`}>{m.message}</div>
                </button>
                {open === m.id && (
                  <button onClick={() => openSystem(m.system_id)} className="mt-1 text-xs text-slate-600 underline">Open system</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
