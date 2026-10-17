import { useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { Button, Card, Chip, DELIVERY, KINDS, PageSkeleton, Switch, ago, shortDate } from "./ui.jsx";

const RULES = [
  ["🔧", "Book a technician", "For faults a customer can't fix. Next working day, the technician already in that area, max 4 visits a day each."],
  ["📱", "Tell the customer", "SMS with the visit date and whether the warranty covers it."],
  ["🧽", "Dust reminders", "SMS asking the customer to rinse the panels. Never more than once a week."],
  ["☁", "Ignore the weather", "Cloudy weeks and healthy systems: no visit, no message."],
];

export default function Autopilot() {
  const { autopilot, orders, messages, setAutopilotOn, refresh, toast } = useConsole();
  const [busy, setBusy] = useState(false);
  if (!autopilot) return <PageSkeleton />;
  const { settings, delivery, rules } = autopilot;
  const last = settings.last_summary;

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const runNow = () => act(async () => {
    const r = await api("/installer/autopilot/run", { method: "POST" });
    toast(r.visits_booked || r.messages_sent
      ? `Booked ${r.visits_booked} visits, sent ${r.messages_sent} messages${r.delivered ? ` (${r.delivered} delivered)` : ""}`
      : "Nothing new to do");
    refresh();
  });

  const log = [
    ...orders.filter((o) => o.created_by === "autopilot").map((o) => ({
      key: `v${o.id}`, icon: "🔧", text: <>Booked <b>{o.technician}</b> for <b>{o.owner_name}</b> ({o.location}) on {shortDate(o.scheduled_date)}</>,
      sub: o.issue_name })),
    ...messages.filter((m) => m.created_by === "autopilot").map((m) => ({
      key: `m${m.id}`, icon: "📱", at: m.sent_at, text: <>SMS to <b>{m.owner_name}</b>: {KINDS[m.kind].toLowerCase()}</>,
      status: m.status })),
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <PageTitle title="Autopilot" sub="Let Soorya handle the routine work: book visits and message customers as soon as a problem is confirmed." />

      <section className={`rounded-2xl p-6 shadow-sm ring-1 transition-colors animate-rise
                           ${settings.enabled ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">{settings.enabled ? "🤖 Autopilot is on" : "Autopilot is off"}</div>
            <p className="text-slate-600 mt-1">
              {settings.enabled
                ? "New problems are handled automatically. You can still change or cancel anything."
                : "Turn it on and it will act on the current work queue right away."}
            </p>
            {settings.last_run && (
              <p className="text-sm text-slate-500 mt-2">
                Last run {ago(settings.last_run)}: {last?.visits_booked ?? 0} visits booked, {last?.messages_sent ?? 0} messages sent
                {last?.delivered ? `, ${last.delivered} delivered for real` : ""}.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {settings.enabled && <Button onClick={runNow} disabled={busy}>Run now</Button>}
            <Switch on={settings.enabled} disabled={busy} onChange={(v) => act(() => setAutopilotOn(v))} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {RULES.map(([icon, title, text]) => (
          <div key={title} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 animate-rise">
            <div className="text-2xl">{icon}</div>
            <div className="font-semibold mt-2">{title}</div>
            <p className="text-sm text-slate-600 mt-1">{text}</p>
          </div>
        ))}
      </div>

      <Card title="Message delivery">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 w-2.5 h-2.5 rounded-full ${delivery.telegram ? "bg-emerald-500" : "bg-slate-300"}`} />
            <div>
              <div className="font-medium">Telegram {delivery.telegram ? "connected" : "not set up"}</div>
              <div className="text-slate-500">SMS messages appear on your phone during the demo.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 w-2.5 h-2.5 rounded-full ${delivery.email ? "bg-emerald-500" : "bg-slate-300"}`} />
            <div>
              <div className="font-medium">Email {delivery.email ? `connected → ${delivery.email_to}` : "not set up"}</div>
              <div className="text-slate-500">Emails go to your own inbox, not the demo customer.</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Demo customers have placeholder contacts, so real messages go to you. At most {rules.real_delivery_per_run} per run are
          delivered; the rest are logged. {!delivery.telegram && !delivery.email && "Set up Telegram or email in .env (see README) to receive them."}
        </p>
      </Card>

      <Card title={`What autopilot has done (${log.length})`}>
        {log.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet. Turn autopilot on to see it work.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {log.map((l) => (
              <li key={l.key} className="py-2.5 flex items-start gap-3">
                <span className="text-lg leading-none">{l.icon}</span>
                <div className="flex-1">
                  <div>{l.text}</div>
                  {l.sub && <div className="text-xs text-slate-500">{l.sub}</div>}
                </div>
                {l.status && <Chip tone={DELIVERY[l.status].tone}>{DELIVERY[l.status].label}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
