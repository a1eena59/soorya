import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home.jsx";
import MySystem from "./pages/MySystem.jsx";
import Connect from "./pages/Connect.jsx";
import MonthlyReport from "./pages/MonthlyReport.jsx";
import Layout from "./installer/Layout.jsx";
import Dashboard from "./installer/Dashboard.jsx";
import Queue from "./installer/Queue.jsx";
import Fleet from "./installer/Fleet.jsx";
import Visits from "./installer/Visits.jsx";
import Messages from "./installer/Messages.jsx";
import Detection from "./installer/Detection.jsx";
import MapPage from "./installer/MapPage.jsx";
import Autopilot from "./installer/Autopilot.jsx";

const customerLinks = [
  ["/system/1", "My system"],
  ["/system/1/report", "Monthly report"],
  ["/connect", "Connect inverter"],
];

// Customer-facing pages: what the installer's customers see
function CustomerLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 print:hidden">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <Link to="/customer" className="font-bold text-xl mr-4"><span className="text-amber-500">☀</span> Soorya</Link>
          {customerLinks.map(([to, label]) => (
            <NavLink key={to} to={to} end
                     className={({ isActive }) => `rounded-full px-3.5 py-1.5 text-sm font-medium transition
                       ${isActive ? "bg-amber-100 text-amber-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
              {label}
            </NavLink>
          ))}
          <Link to="/" className="ml-auto text-xs text-slate-400 hover:text-slate-700">Installer console →</Link>
        </nav>
      </header>
      <main key={pathname} className="flex-1 min-w-0 w-full max-w-6xl mx-auto px-4 py-8 animate-fade-in">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-5 text-sm text-slate-500 flex flex-wrap justify-between gap-2">
          <span><span className="text-amber-500">☀</span> Soorya: independent checks for rooftop solar</span>
          <span>Satellite weather: Open-Meteo</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/autopilot" element={<Autopilot />} />
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/visits" element={<Visits />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/detection" element={<Detection />} />
      </Route>
      <Route element={<CustomerLayout />}>
        <Route path="/customer" element={<Home />} />
        <Route path="/system/:id" element={<MySystem />} />
        <Route path="/system/:id/report" element={<MonthlyReport />} />
        <Route path="/connect" element={<Connect />} />
      </Route>
      <Route path="/installer" element={<Navigate to="/" replace />} />
      <Route path="/model" element={<Navigate to="/detection" replace />} />
      <Route path="/audit" element={<Navigate to="/customer" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
