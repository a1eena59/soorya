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
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);       // system id in the side panel
  const [notifyFor, setNotifyFor] = useState(null);     // {system, kind}
  const [scheduleFor, setScheduleFor] = useState(null); // system
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [o, f, w, n] = await Promise.all([
        api("/installer/overview"), api("/installer/fleet"),
        api("/installer/work-orders"), api("/installer/notifications"),
      ]);
      setOverview(o); setFleet(f); setOrders(w); setMessages(n); setError(null);
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

  return (
    <Ctx.Provider value={{
      overview, fleet, orders, messages, technicians, error, refresh, toast, toasts, system,
      selected, openSystem: setSelected, closeSystem: () => setSelected(null),
      notifyFor, notify: (s, kind) => setNotifyFor({ system: s, kind }), closeNotify: () => setNotifyFor(null),
      scheduleFor, schedule: setScheduleFor, closeSchedule: () => setScheduleFor(null),
    }}>
      {children}
    </Ctx.Provider>
  );
}
