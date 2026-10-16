import { Link, NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import QuoteAudit from "./pages/QuoteAudit.jsx";
import MySystem from "./pages/MySystem.jsx";
import Installer from "./pages/Installer.jsx";
import ModelStats from "./pages/ModelStats.jsx";

const links = [
  ["/audit", "Check a quote"],
  ["/system/1", "My system"],
];

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-5 items-center print:hidden">
        <Link to="/" className="font-bold text-amber-500 text-xl mr-4">☀ Soorya</Link>
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isActive ? "text-amber-600 font-semibold" : "text-slate-600 hover:text-slate-900"
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 min-w-0 w-full max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/audit" element={<QuoteAudit />} />
          <Route path="/system/:id" element={<MySystem />} />
          <Route path="/installer" element={<Installer />} />
          <Route path="/model" element={<ModelStats />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 px-4 py-4 text-sm text-slate-500 flex flex-wrap gap-4 print:hidden">
        <span>Soorya: independent checks for rooftop solar</span>
        <Link to="/installer" className="hover:text-slate-800">For installers</Link>
        <Link to="/model" className="hover:text-slate-800">How our fault detection performs</Link>
      </footer>
    </div>
  );
}
