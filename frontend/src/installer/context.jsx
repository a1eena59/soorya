import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api.js";

const Ctx = createContext(null);
export const useConsole = () => useContext(Ctx);

export function ConsoleProvider({ children }) {
  const [overview, setOverview] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [autopilot, setAutopilot] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);       // system id in the side panel
  const [notifyFor, setNotifyFor] = useState(null);     // {system, kind}
  const [scheduleFor, setScheduleFor] = useState(null); // system
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [o, f, w, n, a] = await Promise.all([
        api("/installer/overview"), api("/installer/fleet"),
        api("/installer/work-orders"), api("/installer/notifications"), api("/installer/autopilot"),
      ]);
      setOverview(o); setFleet(f); setOrders(w); setMessages(n); setAutopilot(a); setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    api("/installer/technicians").then(setTechnicians).catch(() => {});
    // ?system=12 opens that system's panel (deep links from messages, demo)
    const id = Number(new URLSearchParams(window.location.search).get("system"));
    if (id) setSelected(id);
  }, [refresh]);

  const toast = useCallback((text, tone = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const system = (id) => fleet?.find((s) => s.id === id);

  // Turning autopilot on acts on the queue immediately; report what it did
  const setAutopilotOn = async (enabled) => {
    const r = await api("/installer/autopilot", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
    });
    if (enabled) {
      const real = r.delivered ? ` · ${r.delivered} delivered to your phone/inbox` : "";
      toast(r.visits_booked || r.messages_sent
        ? `Autopilot booked ${r.visits_booked} visits and sent ${r.messages_sent} messages${real}`
        : "Autopilot is on. Nothing to do right now.");
    } else {
      toast("Autopilot is off");
    }
    await refresh();
    return r;
  };

  return (
    <Ctx.Provider value={{
      overview, fleet, orders, messages, technicians, autopilot, error, refresh, toast, toasts, system, setAutopilotOn,
      selected, openSystem: setSelected, closeSystem: () => setSelected(null),
      notifyFor, notify: (s, kind) => setNotifyFor({ system: s, kind }), closeNotify: () => setNotifyFor(null),
      scheduleFor, schedule: setScheduleFor, closeSchedule: () => setScheduleFor(null),
    }}>
      {children}
    </Ctx.Provider>
  );
}
