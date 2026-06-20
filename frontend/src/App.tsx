import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminPage from "./components/AdminPage";
import CrisisReportForm from "./components/CrisisReportForm";
import Dashboard from "./components/Dashboard";
import OfflineSyncBanner from "./components/OfflineSyncBanner";

export default function App() {
  return (
    <BrowserRouter>
      <OfflineSyncBanner />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/report" element={<CrisisReportForm />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
