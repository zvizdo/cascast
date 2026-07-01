import type { Config } from "tailwindcss";
const config: Config = {
  content: ["../src/app/**/*.{ts,tsx}", "../src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: "var(--accent)",
        good: "var(--good)",
        caution: "var(--caution)",
        alert: "var(--alert)",
        d1: "var(--d1)",
        d2: "var(--d2)",
        d3: "var(--d3)",
        d4: "var(--d4)",
        d5: "var(--d5)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "14px",
        sm: "9px",
      },
    },
  },
  plugins: [],
};
export default config;
