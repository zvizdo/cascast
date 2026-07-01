import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

beforeEach(() => {
  document.documentElement.dataset.theme = "glacier";
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("toggles [data-theme] and persists", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe("slate");
    expect(localStorage.getItem("cascast.theme")).toBe("slate");
    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe("glacier");
    expect(localStorage.getItem("cascast.theme")).toBe("glacier");
  });

  it("reflects slate via aria-pressed", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /theme/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("defaults to glacier when neither storage nor dataset is set", () => {
    delete document.documentElement.dataset.theme;
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /theme/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reads the stored theme on mount", () => {
    localStorage.setItem("cascast.theme", "slate");
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe("slate");
    expect(screen.getByRole("button", { name: /theme/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
