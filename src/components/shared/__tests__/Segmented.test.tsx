import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Segmented } from "@/components/shared/Segmented";

describe("Segmented", () => {
  it("is a radiogroup; clicking a radio fires onChange", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="Zoom"
        value="day"
        onChange={onChange}
        options={[
          { value: "day", label: "Daily" },
          { value: "hour", label: "Hourly" },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Zoom" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Hourly" }));
    expect(onChange).toHaveBeenCalledWith("hour");
    expect(screen.getByRole("radio", { name: "Daily" })).toHaveAttribute("aria-checked", "true");
  });

  it("marks the active radio with is-active", () => {
    render(
      <Segmented
        value="b"
        onChange={() => {}}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "B" })).toHaveClass("is-active");
    expect(screen.getByRole("radio", { name: "A" })).not.toHaveClass("is-active");
  });

  it("roving tabindex: only the active radio is in the tab order", () => {
    render(
      <Segmented
        value="day"
        onChange={() => {}}
        options={[
          { value: "day", label: "Daily" },
          { value: "hour", label: "Hourly" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Daily" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Hourly" })).toHaveAttribute("tabindex", "-1");
  });

  function Controlled() {
    const [v, setV] = React.useState("a");
    return (
      <Segmented
        value={v}
        onChange={setV}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ]}
      />
    );
  }

  it("ArrowRight moves the active radio forward and follows focus", () => {
    render(<Controlled />);
    const a = screen.getByRole("radio", { name: "A" });
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    const b = screen.getByRole("radio", { name: "B" });
    expect(b).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveFocus();
  });

  it("ArrowLeft wraps from the first to the last radio", () => {
    render(<Controlled />);
    const a = screen.getByRole("radio", { name: "A" });
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    const c = screen.getByRole("radio", { name: "C" });
    expect(c).toHaveAttribute("aria-checked", "true");
    expect(c).toHaveFocus();
  });

  it("Home / End jump to the first / last radio", () => {
    render(<Controlled />);
    const a = screen.getByRole("radio", { name: "A" });
    a.focus();
    fireEvent.keyDown(a, { key: "End" });
    expect(screen.getByRole("radio", { name: "C" })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "C" }), { key: "Home" });
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("aria-checked", "true");
  });
});
