import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import CrisisReportForm from "./components/CrisisReportForm";
import Dashboard from "./components/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/report" element={<CrisisReportForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
