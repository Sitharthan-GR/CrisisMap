import { Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const theme = useTheme();

  return (
    <button
      type="button"
      className="icon-btn sm"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => toggleTheme()}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={2} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={2} />
      )}
    </button>
  );
}
