import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PinNotes } from "@/components/mountain/PinNotes";
import { getPin } from "@/lib/pins";

beforeEach(() => {
  window.localStorage.clear();
});

describe("PinNotes", () => {
  it("reads the saved note from the local pin", () => {
    window.localStorage.setItem(
      "cascast.pins",
      JSON.stringify([
        { mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-16", notes: "Prior note", createdAt: "2026-06-10T00:00:00.000Z" },
      ]),
    );
    render(<PinNotes slug="mt-rainier" name="Mount Rainier" targetDate="2026-06-16" />);
    expect((screen.getByRole("textbox", { name: /notes/i }) as HTMLTextAreaElement).value).toBe("Prior note");
  });

  it("creates a pin on first edit when none exists (addPin)", () => {
    render(<PinNotes slug="mt-rainier" name="Mount Rainier" targetDate="2026-06-16" />);
    fireEvent.change(screen.getByRole("textbox", { name: /notes/i }), {
      target: { value: "Camp Muir" },
    });
    const pin = getPin("mt-rainier");
    expect(pin?.notes).toBe("Camp Muir");
    expect(pin?.targetDate).toBe("2026-06-16");
  });

  it("updates an existing pin on edit (updatePin)", () => {
    window.localStorage.setItem(
      "cascast.pins",
      JSON.stringify([
        { mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-16", notes: "Old", createdAt: "2026-06-10T00:00:00.000Z" },
      ]),
    );
    render(<PinNotes slug="mt-rainier" name="Mount Rainier" targetDate="2026-06-16" />);
    fireEvent.change(screen.getByRole("textbox", { name: /notes/i }), {
      target: { value: "New note" },
    });
    expect(getPin("mt-rainier")?.notes).toBe("New note");
  });

  it("renders the zone line when zoneName is provided", () => {
    render(<PinNotes slug="mt-rainier" name="Mount Rainier" targetDate="2026-06-16" zoneName="west-slopes-south" />);
    expect(screen.getByText(/zone · west-slopes-south/i)).toBeInTheDocument();
  });
});
