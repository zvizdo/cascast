import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MountainSearch } from "@/components/create/MountainSearch";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { Mountain } from "@/lib/types";
import { track } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  mountainParams: (m: { slug: string; name: string; region: string }) => ({
    mountain_slug: m.slug,
    mountain_name: m.name,
    region: m.region,
  }),
}));

const base: Omit<Mountain, "slug" | "name" | "elevations"> = {
  lat: 46.85,
  lng: -121.76,
  nwacZone: "west-slopes-south",
  nwacZoneId: "1648",
  snotelStationId: "679",
  snotelStationTriplet: "679:WA:SNTL",
  snotelStationName: "Paradise",
  region: "cascades-south",
  timezone: "America/Los_Angeles",
  description: "",
};

const mts: Mountain[] = [
  { ...base, slug: "mt-rainier", name: "Mount Rainier", elevations: { base: 5420, mid: 10188, summit: 14410 } },
  { ...base, slug: "mt-baker", name: "Mount Baker", elevations: { base: 3500, mid: 6000, summit: 10781 } },
];

beforeEach(() => {
  useUnits.setState(DEFAULT_UNITS);
  vi.mocked(track).mockClear();
});

describe("MountainSearch", () => {
  it("filters by query and selects a result", () => {
    const onSelect = vi.fn();
    render(<MountainSearch mountains={mts} value={null} onSelect={onSelect} onClear={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Rainier/i), { target: { value: "baker" } });
    fireEvent.click(screen.getByText("Mount Baker"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: "mt-baker" }));
  });

  it("shows a no-match message", () => {
    render(<MountainSearch mountains={mts} value={null} onSelect={vi.fn()} onClear={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Rainier/i), { target: { value: "zzz" } });
    expect(screen.getByText(/no peaks match/i)).toBeInTheDocument();
  });

  it("exposes combobox/listbox ARIA wiring", () => {
    render(<MountainSearch mountains={mts} value={null} onSelect={vi.fn()} onClear={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", input.getAttribute("aria-controls")!);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBe(2);
  });

  it("omits aria-controls when the listbox is closed", () => {
    render(<MountainSearch mountains={mts} value={null} onSelect={vi.fn()} onClear={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-controls"); // open → wired to the listbox
    fireEvent.keyDown(input, { key: "Escape" }); // closed → no dangling reference
    expect(input).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects an option by keyboard (ArrowDown to second, then Enter)", () => {
    const onSelect = vi.fn();
    render(<MountainSearch mountains={mts} value={null} onSelect={onSelect} onClear={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    // first ArrowDown → index 0 (Mount Rainier), second → index 1 (Mount Baker)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: "mt-baker" }));
  });

  it("marks the active option via aria-activedescendant and aria-selected", () => {
    render(<MountainSearch mountains={mts} value={null} onSelect={vi.fn()} onClear={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" }); // active → index 0
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("Escape closes the listbox", () => {
    render(<MountainSearch mountains={mts} value={null} onSelect={vi.fn()} onClear={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the chosen card with summit elevation and a Change button", () => {
    const onClear = vi.fn();
    render(
      <MountainSearch mountains={mts} value={mts[0]} onSelect={vi.fn()} onClear={onClear} />,
    );
    expect(screen.getByText("Mount Rainier")).toBeInTheDocument();
    expect(screen.getByText(/14,410 ft/)).toBeInTheDocument(); // summit elevation via fmtDist
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it("omits the nwacZone segment (no dangling separator) when the zone is empty", () => {
    const whitney: Mountain = {
      ...base,
      slug: "mt-whitney",
      name: "Mount Whitney",
      elevations: { base: 8360, mid: 12000, summit: 14505 },
      nwacZone: "",
      nwacZoneId: "",
      snotelStationId: "",
      snotelStationTriplet: "",
      snotelStationName: "",
      region: "sierra-nevada",
    };
    render(
      <MountainSearch mountains={[whitney]} value={whitney} onSelect={vi.fn()} onClear={vi.fn()} />,
    );
    const meta = screen.getByText(/sierra-nevada/);
    expect(meta.textContent).not.toMatch(/·\s*$/); // no trailing "· "
    expect(meta.textContent).not.toContain("·  ");
  });

  it("tracks search_result_selected with mountain dims on choose", () => {
    const onSelect = vi.fn();
    render(<MountainSearch mountains={mts} value={null} onSelect={onSelect} onClear={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rain" } });
    fireEvent.click(screen.getByRole("option", { name: /rainier/i }));
    expect(track).toHaveBeenCalledWith(
      "search_result_selected",
      expect.objectContaining({ mountain_slug: "mt-rainier" }),
    );
  });

  it("tracks debounced search_performed with query_length", () => {
    vi.useFakeTimers();
    try {
      render(<MountainSearch mountains={mts} value={null} onSelect={() => {}} onClear={() => {}} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "bake" } });
      vi.advanceTimersByTime(600);
      expect(track).toHaveBeenCalledWith("search_performed", { query_length: 4 });
    } finally {
      vi.useRealTimers();
    }
  });
});
