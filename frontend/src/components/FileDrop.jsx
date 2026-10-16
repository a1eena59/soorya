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
      className={`w-full rounded-xl border-2 border-dashed p-6 text-left transition
        ${over ? "border-amber-500 bg-amber-50" : done ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-white hover:border-amber-400"}`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => pick(e.target.files[0])}
      />
      <div className="font-semibold">{label}</div>
      <div className="text-sm text-slate-500 mt-1">
        {busy ? busyText : done ? `✓ ${name || "Read"}` : hint}
      </div>
    </button>
  );
}
