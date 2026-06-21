import { Outlet } from "react-router-dom";
import MobileBottomNav from "../components/MobileBottomNav";
import { MobileNavProvider } from "../lib/MobileNavContext";

export default function MobileAppLayout() {
  return (
    <MobileNavProvider>
      <div className="mobile-app-shell">
        <div className="mobile-app-content">
          <Outlet />
        </div>
        <MobileBottomNav />
      </div>
    </MobileNavProvider>
  );
}
