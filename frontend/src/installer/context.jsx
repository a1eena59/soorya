import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api.js";

const Ctx = createContext(null);
export const useConsole = () => useContext(Ctx);

const post = (path, body) => api(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
});

export function ConsoleProvider({ children }) {
  const [overview, setOverview] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [agent, setAgent] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);                 // text while a slow action runs
  const [selected, setSelected] = useState(null);
  const [notifyFor, setNotifyFor] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [completeFor, setCompleteFor] = useState(null);   // work order being marked done
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [o, f, w, n, a, t] = await Promise.all([
        api("/installer/overview"), api("/installer/fleet"), api("/installer/work-orders"),
        api("/installer/notifications"), api("/agent"), api("/agent/tickets"),
      ]);
      setOverview(o); setFleet(f); setOrders(w); setMessages(n); setAgent(a); setTickets(t); setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    api("/installer/technicians").then(setTechnicians).catch(() => {});
    const id = Number(new URLSearchParams(window.location.search).get("system"));
    if (id) setSelected(id);
  }, [refresh]);

  const toast = useCallback((text, tone = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Wraps slow agent actions: shows a progress bar, reports what happened, refreshes
  const run = useCallback(async (label, fn, report) => {
    setBusy(label);
    try {
      const r = await fn();
      if (report) toast(report(r));
      await refresh();
      return r;
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }, [refresh, toast]);

  const actions = (r) => (r.actions?.length ? `Agent: ${r.actions.length} actions` : "Agent: nothing new to do");

  const value = {
    overview, fleet, orders, messages, tickets, agent, technicians, error, busy, refresh, toast, toasts,
    system: (id) => fleet?.find((s) => s.id === id),
    selected, openSystem: setSelected, closeSystem: () => setSelected(null),
    notifyFor, notify: (s, kind) => setNotifyFor({ system: s, kind }), closeNotify: () => setNotifyFor(null),
    scheduleFor, schedule: setScheduleFor, closeSchedule: () => setScheduleFor(null),
    completeFor, complete: setCompleteFor, closeComplete: () => setCompleteFor(null),
    setAgentOn: (enabled) => run(enabled ? "Agent is triaging…" : "Turning off…",
      () => post("/agent", { enabled }), (r) => (enabled ? actions(r) : "Agent off")),
    runAgent: () => run("Agent is working…", () => post("/agent/run"), actions),
    advance: (days = 3) => run(`Moving the clock ${days} days…`, () => post("/agent/advance", { days }),
      (r) => `${r.moved.to}: ${actions(r).replace("Agent: ", "")}`),
    approveAll: () => run("Booking visits…", () => post("/agent/approve"), (r) => `${r.approved} visits booked, owners told by SMS`),
    sendTechnician: (ticketId) => run("Proposing a visit…", () => post(`/agent/tickets/${ticketId}/technician`), () => "Visit proposed"),
    retrain: () => run("Retraining the model…", () => post("/agent/retrain"), (r) => `Retrained: ${(r.accuracy * 100).toFixed(1)}% accuracy`),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
