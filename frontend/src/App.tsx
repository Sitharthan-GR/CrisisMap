import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminPage from "./components/AdminPage";
import AdminFormManager from "./components/AdminFormManager";
import CrisisReportForm from "./components/CrisisReportForm";
import Dashboard from "./components/Dashboard";
import MapHelpPage from "./components/MapHelpPage";
import MobileAppLayout from "./components/MobileAppLayout";
import OfflineSyncBanner from "./components/OfflineSyncBanner";

export default function App() {
  return (
    <BrowserRouter>
      <OfflineSyncBanner />
      <Routes>
        <Route element={<MobileAppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports/:reportId" element={<Dashboard />} />
          <Route path="/report" element={<CrisisReportForm />} />
          <Route path="/help" element={<MapHelpPage />} />
        </Route>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/forms" element={<AdminFormManager />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
