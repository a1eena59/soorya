import { useRef, useState } from "react";

export default function FileDrop({ label, hint, onFile, busy, done, accept = "image/*,application/pdf", busyText = "Reading with AI…" }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState(null);

  const pick = (file) => {
    if (!file) return;
    setName(file.name);
    onFile(file);
  };

  return (
    <button
      type="button"
      onClick={() => input.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      disabled={busy}
      className={`w-full rounded-2xl border-2 border-dashed p-6 text-left transition duration-200
        ${over ? "border-amber-500 bg-amber-50 scale-[1.01]" : done ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50/40"}`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => pick(e.target.files[0])}
      />
      <div className="flex items-center gap-4">
        <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xl
          ${done ? "bg-emerald-500 text-white" : "bg-slate-100"}`}>
          {busy ? <span className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /> : done ? "✓" : "⇪"}
        </span>
        <span>
          <span className="block font-semibold">{label}</span>
          <span className="block text-sm text-slate-500 mt-0.5">{busy ? busyText : done ? `${name || "Read"} · tap to replace` : hint}</span>
        </span>
      </div>
    </button>
  );
}
