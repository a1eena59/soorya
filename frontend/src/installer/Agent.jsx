import { useConsole } from "./context.jsx";
import { PageTitle } from "./Layout.jsx";
import { AgentToggle, Button, Card, FAULT_SHORT, PageSkeleton, STAGES } from "./ui.jsx";

const COLUMNS = ["waiting", "owner", "verifying", "technician"];

function TicketCard({ t }) {
  const { openSystem, sendTechnician } = useConsole();
  const last = t.events.at(-1);
  return (
    <button onClick={() => openSystem(t.system_id)}
            className="w-full text-left rounded-xl bg-white ring-1 ring-slate-200 shadow-sm p-3 hover:shadow-md hover:-translate-y-0.5 transition animate-rise">
      <div className="flex justify-between gap-2">
        <span className="font-semibold truncate">{t.owner_name}</span>
      </div>
      <div className="text-xs text-slate-500">{FAULT_SHORT[t.fault]} · {t.location}</div>
      <div className="text-xs text-slate-600 mt-2 line-clamp-2">{last?.text}</div>
      {t.stage === "callback" && (
        <span onClick={(e) => { e.stopPropagation(); sendTechnician(t.id); }}
              className="inline-block mt-2 rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1">
          Send technician
        </span>
      )}
    </button>
  );
}

export default function Agent() {
  const { agent, tickets, busy, setAgentOn, advance, approveAll, retrain, runAgent } = useConsole();
  if (!agent) return <PageSkeleton />;
  const { settings, summary: s } = agent;
  const open = tickets.filter((t) => t.status === "open");
  const closed = tickets.filter((t) => t.status === "closed").slice(0, 8);
  const col = (stage) => open.filter((t) => t.stage === stage || (stage === "owner" && t.stage === "callback"));

  return (
    <div className="space-y-6">
      <PageTitle title="Agent" sub="From alert to verified fix."
                 actions={<>
                   <Button onClick={() => advance(3)} disabled={!!busy} title="Demo: generate the next 3 days of data">⏩ +3 days</Button>
                   {settings.enabled && <Button onClick={runAgent} disabled={!!busy}>Run now</Button>}
                   <AgentToggle on={settings.enabled} onChange={setAgentOn} disabled={!!busy} />
                 </>} />

      {s.proposed.jobs > 0 && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 flex flex-wrap items-center justify-between gap-3 animate-rise">
          <div>
            <div className="font-semibold">{s.proposed.jobs} visits ready to book</div>
            <div className="text-sm text-amber-900">{s.proposed.warranty} under warranty</div>
          </div>
          <Button variant="dark" onClick={approveAll} disabled={!!busy}>Approve all</Button>
        </div>
      )}

      {open.length === 0 && !settings.enabled ? (
        <Card>
          <div className="text-center py-10">
            <div className="text-4xl">🤖</div>
            <p className="mt-3 text-slate-600">Turn the agent on to start working through faults.</p>
            <div className="mt-4"><AgentToggle on={false} onChange={setAgentOn} disabled={!!busy} size="lg" /></div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
          {COLUMNS.map((stage) => {
            const items = col(stage);
            return (
              <section key={stage} className="rounded-2xl bg-slate-200/50 p-3">
                <h2 className="px-1 pb-3 font-semibold flex items-center gap-2">
                  <span>{STAGES[stage].icon}</span>{STAGES[stage].label}
                  <span className="rounded-full bg-white px-2 text-xs font-bold ring-1 ring-slate-200">{items.length}</span>
                </h2>
                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {items.map((t) => <TicketCard key={t.id} t={t} />)}
                  {items.length === 0 && <p className="px-1 text-sm text-slate-400">None</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Results" className="lg:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[["Fixed", s.fixed], ["Fixed by owners", `${s.owner_fix_rate}%`], ["Open", s.open], ["Unresolved", s.unresolved]]
              .map(([label, v]) => (
                <div key={label}>
                  <div className="text-2xl font-bold tabular-nums">{v}</div>
                  <div className="text-sm text-slate-500">{label}</div>
                </div>
              ))}
          </div>
          {closed.length > 0 && (
            <ul className="mt-5 divide-y divide-slate-100 text-sm">
              {closed.map((t) => (
                <li key={t.id} className="py-2 flex justify-between gap-3">
                  <span className="truncate">{t.owner_name} · {FAULT_SHORT[t.fault]}</span>
                  <span className="text-slate-500 truncate">{(t.resolution ?? "").replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Learning">
          <div className="text-2xl font-bold">{s.confirmed_labels}</div>
          <p className="text-sm text-slate-500">confirmed causes added to the training data</p>
          <Button className="mt-4" onClick={retrain} disabled={!!busy || !s.confirmed_labels}>Retrain model</Button>
          <p className="text-xs text-slate-400 mt-3">{s.llm ? "Messages written by Gemini, checked by safety rules." : "Messages from templates (no Gemini key)."}</p>
          <p className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-500">Owners get SMS (demo: saved in Messages).</p>
        </Card>
      </div>
    </div>
  );
}
