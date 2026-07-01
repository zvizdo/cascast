import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { UnitsToggle } from "@/components/layout/UnitsToggle";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";

beforeEach(() => {
  useUnits.setState(DEFAULT_UNITS);
});

describe("UnitsToggle", () => {
  it("is a labeled group with three axes", () => {
    render(<UnitsToggle />);
    expect(screen.getByRole("group", { name: /display units/i })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /temperature/i })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /wind/i })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /distance/i })).toBeInTheDocument();
  });

  it("switching temp updates the store", () => {
    render(<UnitsToggle />);
    fireEvent.click(screen.getByRole("radio", { name: /°C/ }));
    expect(useUnits.getState().temp).toBe("C");
  });

  it("switching wind updates the store", () => {
    render(<UnitsToggle />);
    fireEvent.click(screen.getByRole("radio", { name: /km\/h/i }));
    expect(useUnits.getState().wind).toBe("kmh");
  });

  it("switching distance updates the store", () => {
    render(<UnitsToggle />);
    fireEvent.click(screen.getByRole("radio", { name: /^m$/ }));
    expect(useUnits.getState().dist).toBe("m");
  });
});
