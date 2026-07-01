/* ThemeToggle — flips [data-theme] between glacier/slate; persists to localStorage. */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";

const KEY = "cascast.theme";
type Theme = "glacier" | "slate";

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = React.useState<Theme>("glacier");

  // read persisted choice on mount
  React.useEffect(() => {
    const stored = localStorage.getItem(KEY) as Theme | null;
    if (stored === "slate" || stored === "glacier") {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
    } else {
      setTheme((document.documentElement.dataset.theme as Theme) ?? "glacier");
    }
  }, []);

  const toggle = () => {
    const next: Theme = theme === "slate" ? "glacier" : "slate";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY, next);
  };

  const isSlate = theme === "slate";
  return (
    <button
      type="button"
      className={"btn btn-ghost btn-sm" + (className ? " " + className : "")}
      aria-label={isSlate ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isSlate}
      onClick={toggle}
    >
      {isSlate ? <Icons.sun size={16} /> : <Icons.moon size={16} />}
    </button>
  );
}
