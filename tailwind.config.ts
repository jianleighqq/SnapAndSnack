import type { Config } from "tailwindcss";

// Colors read CSS variables (RGB channels) so light/dark mode can swap them and
// Tailwind opacity modifiers like `bg-ink/10` still work.
const fromVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: fromVar("--paper"),
        ink: fromVar("--ink"),
        surface: fromVar("--surface"),
        muted: fromVar("--muted"),
        accent: fromVar("--accent"),
        sun: fromVar("--sun"),
        ok: fromVar("--ok"),
        warn: fromVar("--warn"),
        danger: fromVar("--danger"),
      },
      fontFamily: {
        display: ["var(--font-anton)", "Impact", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        tile: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
