import { Link } from "react-router-dom";

const STEPS = [
  ["Photo of your bill", "We read your real electricity use from your latest KSEB bill."],
  ["Photo of the quote", "We read the size, price, warranties and promises the installer made."],
  ["Honest answer", "Right size for your home, fair price, realistic payback, and what to ask before signing."],
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="text-center pt-8">
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">
          Is your rooftop solar <span className="text-amber-500">worth it?</span>
        </h1>
        <p className="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
          Rooftop solar costs ₹1.5–4 lakh and lasts 25 years. Soorya checks the quote before you sign,
          and checks the system works after you install. Independent of every installer.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Link to="/audit" className="group rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 hover:border-amber-500">
          <div className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Before you buy</div>
          <h2 className="text-2xl font-bold mt-2">Check a solar quote</h2>
          <p className="text-slate-700 mt-2">
            Is the system the right size for your home? Is the price fair? Are the savings real?
            Get an answer in a minute, free.
          </p>
          <span className="inline-block mt-4 bg-amber-500 group-hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg font-semibold">
            Check my quote →
          </span>
        </Link>

        <Link to="/system/1" className="group rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-slate-400">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Already installed</div>
          <h2 className="text-2xl font-bold mt-2">Is my system working?</h2>
          <p className="text-slate-700 mt-2">
            We compare what your panels made with what the sun allowed that day, and tell you
            if something is wrong, before your warranty runs out.
          </p>
          <span className="inline-block mt-4 bg-slate-800 group-hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg font-semibold">
            See my system →
          </span>
        </Link>
      </section>

      <section>
        <h2 className="text-xl font-bold text-center">How the quote check works</h2>
        <ol className="grid gap-4 md:grid-cols-3 mt-6">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-xl bg-white border border-slate-200 p-5">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center">{i + 1}</div>
              <div className="font-semibold mt-3">{title}</div>
              <p className="text-sm text-slate-600 mt-1">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl bg-slate-800 text-slate-100 p-6 md:p-8 grid gap-6 md:grid-cols-3 text-center">
        <div>
          <div className="text-3xl font-bold text-amber-400">33 lakh+</div>
          <div className="text-sm mt-1">rooftop systems installed in India since 2024</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-amber-400">25 years</div>
          <div className="text-sm mt-1">that each system must keep performing</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-amber-400">No</div>
          <div className="text-sm mt-1">routine independent check of whether they actually work</div>
        </div>
      </section>
    </div>
  );
}
