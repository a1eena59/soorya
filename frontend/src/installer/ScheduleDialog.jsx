import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConsole } from "./context.jsx";
import { Button, Dialog, WarrantyChip, fmtDate } from "./ui.jsx";

function nextWorkingDay(iso) {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ScheduleDialog() {
  const { scheduleFor: s, closeSchedule, technicians, orders, refresh, toast } = useConsole();
  const [tech, setTech] = useState("");
  const [day, setDay] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [busy, setBusy] = useState(false);

  const open = orders.filter((o) => o.status === "scheduled");
  const load = (t) => open.filter((o) => o.technician === t).length;
  const sameArea = (t) => open.filter((o) => o.technician === t && o.location === s?.location).length;

  useEffect(() => {
    if (!s) return;
    setDay(s.work_order?.scheduled_date ?? nextWorkingDay(s.as_of));
    // Suggest whoever is already going to this area, else the least busy technician
    const pick = [...technicians].sort((a, b) => sameArea(b) - sameArea(a) || load(a) - load(b))[0];
    setTech(s.work_order?.technician ?? pick ?? "");
    setNotifyCustomer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id]);

  const save = async () => {
    setBusy(true);
    try {
      await api("/installer/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_id: s.id, technician: tech, scheduled_date: day }),
      });
      if (notifyCustomer) {
        const d = await api(`/installer/systems/${s.id}/compose?channel=sms&kind=visit_scheduled`);
        await api("/installer/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system_id: s.id, channel: "sms", kind: "visit_scheduled", message: d.message }),
        });
      }
      toast(`Visit booked: ${tech}, ${fmtDate(day)}${notifyCustomer ? " · customer SMS logged" : ""}`);
      closeSchedule();
      refresh();
    } catch (e) {
      toast(`Could not schedule: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!s} onClose={closeSchedule} title="Schedule a technician visit"
            footer={<>
              <Button onClick={closeSchedule}>Cancel</Button>
              <Button variant="dark" onClick={save} disabled={!tech || !day || busy}>{busy ? "Saving…" : "Book visit"}</Button>
            </>}>
      {s && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-sm">
            <div className="font-semibold">{s.owner_name} · {s.name}</div>
            <div className="text-slate-600">{s.location} · {s.capacity_kw} kW · {s.phone}</div>
            {s.issue && <div className="mt-1">{s.issue.name}: <b>-{s.issue.fault_pct}%</b> since {fmtDate(s.issue.start_date)}</div>}
            <div className="mt-2"><WarrantyChip covered={s.warranty_covered} /></div>
          </div>

          <div>
            <div className="text-sm text-slate-600 mb-1.5">Technician</div>
            <div className="grid gap-2">
              {technicians.map((t) => (
                <label key={t} className={`flex items-center justify-between rounded-lg px-3 py-2 ring-1 cursor-pointer
                                          ${tech === t ? "ring-2 ring-slate-900 bg-slate-50" : "ring-slate-200"}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" checked={tech === t} onChange={() => setTech(t)} />
                    <span className="font-medium">{t}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {load(t)} visits booked{sameArea(t) ? ` · ${sameArea(t)} already in ${s.location}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="text-slate-600">Date</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
                   className="mt-1 w-full rounded-lg ring-1 ring-slate-300 px-3 py-2" />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
            Tell the customer by SMS (date, technician, warranty)
          </label>
        </div>
      )}
    </Dialog>
  );
}
