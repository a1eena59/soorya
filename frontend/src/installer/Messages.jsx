import { useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Card, Chip, KINDS, ago, fmtDate } from "./ui.jsx";

export default function Messages() {
  const { messages, fleet, openSystem, refresh, toast } = useConsole();
  const [channel, setChannel] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState(null);
  if (!fleet) return <p className="text-slate-500">Loading…</p>;

  const rows = messages.filter((m) => (!channel || m.channel === channel) && (!kind || m.kind === kind));
  const dust = fleet.filter((s) => s.lane === "customer");
  const dustUnreminded = dust.filter((s) => !s.last_notified).length;

  const bulk = async (ch) => {
    const r = await api("/installer/notify/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane: "customer", channel: ch }),
    });
    toast(r.sent ? `${r.sent} reminders logged by ${ch.toUpperCase()} (demo, not sent)` : "Everyone was already reminded this week");
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Customer messages" sub="SMS and email to customers: cleaning reminders, fault alerts, visit confirmations." />

      <div className="rounded-xl bg-sky-50 ring-1 ring-sky-200 px-4 py-3 text-sm text-sky-900">
        <b>Demo mode.</b> Messages are written and saved to this outbox but not delivered. Connecting an SMS gateway
        (e.g. MSG91, Twilio) or an email service turns this on. Contact details in this demo are placeholders.
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Dust reminders">
          <p className="text-sm text-slate-600">{dust.length} customers can fix their drop by rinsing the panels. {dustUnreminded} haven't been told yet.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => bulk("sms")} disabled={!dustUnreminded}>Send by SMS</Button>
            <Button onClick={() => bulk("email")} disabled={!dustUnreminded}>Send by email</Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Skips anyone messaged in the last 7 days.</p>
        </Card>
        <Card title="Sent">
          <div className="text-3xl font-bold">{messages.length}</div>
          <div className="text-sm text-slate-600">
            {messages.filter((m) => m.channel === "sms").length} SMS · {messages.filter((m) => m.channel === "email").length} email
          </div>
        </Card>
        <Card title="Templates">
          <ul className="text-sm space-y-1 text-slate-700">
            {Object.values(KINDS).map((k) => <li key={k}>• {k}</li>)}
          </ul>
          <p className="text-xs text-slate-500 mt-2">Filled in from each system's diagnosis; editable before sending.</p>
        </Card>
      </div>

      <Card title="Outbox" action={
        <div className="flex gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-lg ring-1 ring-slate-300 px-2 py-1 text-sm bg-white">
            <option value="">All channels</option><option value="sms">SMS</option><option value="email">Email</option>
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg ring-1 ring-slate-300 px-2 py-1 text-sm bg-white">
            <option value="">All types</option>
            {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      }>
        {rows.length === 0 ? <p className="text-sm text-slate-500">No messages yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((m) => (
              <li key={m.id} className="py-3">
                <button className="w-full text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Chip tone={m.channel === "sms" ? "blue" : "violet"}>{m.channel === "sms" ? "SMS" : "Email"}</Chip>
                    <b>{m.owner_name}</b>
                    <span className="text-slate-500">{m.location} · {m.recipient}</span>
                    <Chip>{KINDS[m.kind]}</Chip>
                    <Chip tone="slate">Logged (demo)</Chip>
                    <span className="ml-auto text-xs text-slate-500" title={fmtDate(m.sent_at)}>{ago(m.sent_at)}</span>
                  </div>
                  <div className={`mt-1 text-sm text-slate-600 ${open === m.id ? "whitespace-pre-line" : "line-clamp-1"}`}>
                    {m.subject && <b>{m.subject}: </b>}{m.message}
                  </div>
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
