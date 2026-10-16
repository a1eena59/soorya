import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import QuoteAudit from "./pages/QuoteAudit.jsx";
import MySystem from "./pages/MySystem.jsx";
import Installer from "./pages/Installer.jsx";
import ModelStats from "./pages/ModelStats.jsx";

const links = [
  ["/", "Home"],
  ["/audit", "Quote Audit"],
  ["/system/1", "My System"],
  ["/installer", "Installer"],
  ["/model", "Model Stats"],
];

export default function App() {
  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-4 items-center">
        <span className="font-bold text-amber-500 text-xl mr-4">☀ Soorya</span>
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              isActive ? "text-amber-600 font-semibold" : "text-slate-600 hover:text-slate-900"
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/audit" element={<QuoteAudit />} />
          <Route path="/system/:id" element={<MySystem />} />
          <Route path="/installer" element={<Installer />} />
          <Route path="/model" element={<ModelStats />} />
        </Routes>
      </main>
    </div>
  );
}
