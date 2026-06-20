import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./i18n";
import { initOfflineSync } from "./lib/offlineSync";
import { initTheme } from "./lib/theme";
import "./index.css";

initTheme();

registerSW({ immediate: true });
initOfflineSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
