import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentTheme, toggleTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getCurrentTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getCurrentTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <button
      type="button"
      className="icon-btn sm"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={2} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={2} />
      )}
    </button>
  );
}
