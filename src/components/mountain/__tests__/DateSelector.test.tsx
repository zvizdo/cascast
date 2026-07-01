// src/components/mountain/__tests__/DateSelector.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateSelector } from "@/components/mountain/DateSelector";
import type { StripDay } from "@/lib/target-date";

const days: StripDay[] = [
  { date: "2026-06-20", label: "Today", dow: "Sat", inRange: true, isToday: true },
  { date: "2026-06-21", label: "Tomorrow", dow: "Sun", inRange: true, isToday: false },
  { date: "2026-06-25", label: "25", dow: "Thu", inRange: false, isToday: false },
];

describe("DateSelector", () => {
  it("states the target in plain English", () => {
    render(<DateSelector days={days} target="2026-06-21" pinned={false} onPick={() => {}} />);
    expect(screen.getByText(/Planning for/i)).toBeInTheDocument();
    expect(screen.getByText(/not pinned/i)).toBeInTheDocument();
  });
  it("marks the selected day pressed and out-of-range days disabled-looking", () => {
    render(<DateSelector days={days} target="2026-06-21" pinned onPick={() => {}} />);
    const tomorrow = screen.getByRole("button", { name: /Tomorrow/ });
    expect(tomorrow).toHaveAttribute("aria-pressed", "true");
  });
  it("calls onPick when a day is clicked", () => {
    const onPick = vi.fn();
    render(<DateSelector days={days} target="2026-06-21" pinned={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /Today/ }));
    expect(onPick).toHaveBeenCalledWith("2026-06-20");
  });
  it("constrains both date pickers to the available forecast window", () => {
    const { container } = render(
      <DateSelector days={days} target="2026-06-21" pinned={false} onPick={() => {}} />,
    );
    const inputs = container.querySelectorAll('input[type="date"]');
    expect(inputs.length).toBe(2); // desktop + mobile
    inputs.forEach((i) => {
      expect(i).toHaveAttribute("min", "2026-06-20"); // first day (today)
      expect(i).toHaveAttribute("max", "2026-06-21"); // last IN-RANGE day, not the OOR 06-25
    });
  });
  it("falls back to the last day for max when none are in range", () => {
    const oor = days.map((d) => ({ ...d, inRange: false }));
    const { container } = render(
      <DateSelector days={oor} target="2026-06-20" pinned={false} onPick={() => {}} />,
    );
    expect(container.querySelector('input[type="date"]')).toHaveAttribute("max", "2026-06-25");
  });
});
