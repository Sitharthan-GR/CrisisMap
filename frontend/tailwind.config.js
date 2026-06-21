/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-2)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          border: "var(--border)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          muted: "var(--accent-hover)",
          foreground: "var(--accent-text)",
          soft: "var(--accent-soft)",
          line: "var(--accent-line)",
        },
        ink: {
          DEFAULT: "var(--text)",
          dim: "var(--text-dim)",
          faint: "var(--text-faint)",
        },
        success: {
          DEFAULT: "var(--dmg-minimal)",
          soft: "var(--dmg-minimal-soft)",
          ink: "var(--dmg-minimal-ink)",
        },
        danger: {
          DEFAULT: "var(--dmg-complete)",
          soft: "var(--dmg-complete-soft)",
          ink: "var(--dmg-complete-ink)",
        },
        warn: {
          DEFAULT: "var(--dmg-partial)",
          soft: "var(--dmg-partial-soft)",
          ink: "var(--dmg-partial-ink)",
        },
        strong: "var(--border-strong)",
      },
      boxShadow: {
        panel: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};
