import { Link, Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import QuoteAudit from "./pages/QuoteAudit.jsx";
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

const customerLinks = [
  ["/audit", "Check a quote"],
  ["/system/1", "My system"],
  ["/connect", "Connect inverter"],
];

// Customer-facing pages: what the installer's customers see
function CustomerLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-5 items-center print:hidden">
        <Link to="/customer" className="font-bold text-amber-500 text-xl mr-4">☀ Soorya</Link>
        {customerLinks.map(([to, label]) => (
          <NavLink key={to} to={to}
                   className={({ isActive }) => (isActive ? "text-amber-600 font-semibold" : "text-slate-600 hover:text-slate-900")}>
            {label}
          </NavLink>
        ))}
        <Link to="/" className="ml-auto text-sm text-slate-500 hover:text-slate-900">Installer console →</Link>
      </nav>
      <main className="flex-1 min-w-0 w-full max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 px-4 py-4 text-sm text-slate-500 print:hidden">
        Soorya: independent checks for rooftop solar
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
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/visits" element={<Visits />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/detection" element={<Detection />} />
      </Route>
      <Route element={<CustomerLayout />}>
        <Route path="/customer" element={<Home />} />
        <Route path="/audit" element={<QuoteAudit />} />
        <Route path="/system/:id" element={<MySystem />} />
        <Route path="/system/:id/report" element={<MonthlyReport />} />
        <Route path="/connect" element={<Connect />} />
      </Route>
      <Route path="/installer" element={<Navigate to="/" replace />} />
      <Route path="/model" element={<Navigate to="/detection" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
