import { Link } from "react-router-dom";

const STEPS = [
  ["🔌", "Connect your inverter", "Upload the report your inverter app already makes. No new hardware, no visit."],
  ["🛰", "We check it every day", "Your output is compared with satellite sunlight for your roof and with nearby systems."],
  ["🔔", "You hear only when it matters", "Cloudy weeks are ignored. A real fault gets a clear message and, if needed, a technician."],
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white px-6 py-12 md:px-12 md:py-16 shadow-lg animate-rise">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-white/15" aria-hidden />
        <div className="absolute right-24 bottom-[-90px] w-56 h-56 rounded-full bg-white/10" aria-hidden />
        <div className="relative max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-wider text-amber-50">☀ Soorya for homeowners</div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mt-3">Is your rooftop solar really working?</h1>
          <p className="text-lg text-amber-50 mt-4">
            Your panels have to perform for 25 years. We check every day that they make what the sun allows,
            and tell you, and your installer, the moment something is wrong.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/system/1" className="bg-white text-amber-700 hover:bg-amber-50 px-6 py-3 rounded-xl font-semibold shadow-sm transition">
              See my system →
            </Link>
            <Link to="/connect" className="bg-amber-700/30 hover:bg-amber-700/40 ring-1 ring-white/40 px-6 py-3 rounded-xl font-semibold transition">
              Connect my inverter
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {[
          ["/system/1", "☀", "bg-emerald-100", "My system", "Is it working right now? What is it saving you?"],
          ["/system/1/report", "📊", "bg-sky-100", "Monthly report", "One page per month you can share or save as PDF."],
          ["/connect", "🔌", "bg-amber-100", "Connect inverter", "Growatt, Solis or Deye export. Takes two minutes."],
        ].map(([to, icon, bg, title, text]) => (
          <Link key={to} to={to} className="group rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6 hover:-translate-y-0.5 hover:shadow-md transition animate-rise">
            <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center text-2xl`}>{icon}</div>
            <h2 className="text-xl font-bold mt-4">{title}</h2>
            <p className="text-slate-600 mt-1">{text}</p>
            <span className="inline-block mt-3 font-semibold text-slate-900 group-hover:translate-x-1 transition">Open →</span>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-bold text-center">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3 mt-6">
          {STEPS.map(([icon, title, text], i) => (
            <li key={title} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 animate-rise">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-sm">{i + 1}</span>
                <span className="text-2xl">{icon}</span>
              </div>
              <div className="font-semibold mt-3">{title}</div>
              <p className="text-sm text-slate-600 mt-1">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
