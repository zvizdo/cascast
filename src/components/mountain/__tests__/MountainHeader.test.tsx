import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MountainHeader } from "@/components/mountain/MountainHeader";
import { readPins, addPin } from "@/lib/pins";
import { defaultTargetISO, dayStripDays, todayISO, addDaysISO } from "@/lib/target-date";
import { dayKeys } from "@/lib/derive";
import { track } from "@/lib/analytics";
import type { Mountain, CombinedForecastBlob, ModelSeries } from "@/lib/types";
import type { HazardsSummary } from "@/lib/hazards/types";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  mountainParams: (m: { slug: string; name: string; region: string }) => ({
    mountain_slug: m.slug,
    mountain_name: m.name,
    region: m.region,
  }),
  horizonDays: () => 2,
}));

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

// A minimal blob whose gfs series spans 7 days from today, so the DateSelector strip
// has in-range day keys to click.
function buildSeries(): ModelSeries {
  const time: string[] = [];
  for (let d = 0; d < 7; d++) {
    const day = addDaysISO(todayISO(), d);
    for (let h = 0; h < 24; h += 6) time.push(`${day}T${String(h).padStart(2, "0")}:00`);
  }
  const arr = <T,>(v: T) => time.map(() => v);
  return {
    available: true,
    time,
    temperature_2m: arr(40),
    apparent_temperature: arr(36),
    wind_speed_10m: arr(12),
    wind_gusts_10m: arr(24),
    wind_direction_10m: arr(230),
    precipitation: arr(0),
    precipitation_probability: arr(10),
    snowfall: arr(0),
    freezing_level_height: arr(11000),
    cloud_cover: arr(30),
    visibility: arr(50000),
    weather_code: arr(1),
    temp_base_f: arr(48),
    temp_mid_f: arr(34),
    temp_summit_f: arr(22),
  };
}
const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: new Date().toISOString(),
  hrrr: null,
  gfs: buildSeries(),
  ecmwf: null,
};
const mockHazardsSummary = vi.fn<() => { summary: HazardsSummary | undefined; isLoading: boolean; error: unknown; mutate: () => void }>(
  () => ({ summary: undefined, isLoading: false, error: null, mutate: vi.fn() }),
);
vi.mock("@/lib/hooks", () => ({
  useMountainWeather: () => ({ blob }),
  useMountainNwac: () => ({ nwac: { season: "summer" } }),
  useMountainHazardsSummary: (slug: string) => mockHazardsSummary(),
}));

const rainier: Mountain = {
  slug: "mt-rainier",
  name: "Mount Rainier",
  lat: 46.8517,
  lng: -121.7603,
  elevations: { base: 5420, mid: 10188, summit: 14410 },
  nwacZone: "west-slopes-south",
  nwacZoneId: "1648",
  snotelStationId: "679",
  snotelStationTriplet: "679:WA:SNTL",
  snotelStationName: "Paradise",
  region: "cascades-south",
  timezone: "America/Los_Angeles",
  description: "The big one.",
};

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  replace.mockClear();
  vi.mocked(track).mockClear();
});

describe("MountainHeader", () => {
  it("persists a pin at the effective (default) target when Pin is clicked", () => {
    render(<MountainHeader mountain={rainier} />);
    const btn = screen.getByRole("button", { name: /pin this peak/i });
    act(() => {
      fireEvent.click(btn);
    });
    const pins = readPins();
    expect(pins).toHaveLength(1);
    expect(pins[0].mountainId).toBe("mt-rainier");
    expect(pins[0].targetDate).toBe(defaultTargetISO());
  });

  it("shows Pinned ✓ + Unpin and removes the pin when clicked, at the current target", () => {
    const target = defaultTargetISO();
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: target, notes: "" });
    render(<MountainHeader mountain={rainier} target={target} />);
    const unpin = screen.getByRole("button", { name: /unpin/i });
    expect(unpin).toHaveTextContent(/pinned/i);
    act(() => {
      fireEvent.click(unpin);
    });
    expect(readPins()).toHaveLength(0);
  });

  it("offers Update pin when pinned at a different target", () => {
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-01-01", notes: "keep me" });
    render(<MountainHeader mountain={rainier} target={defaultTargetISO()} />);
    const update = screen.getByRole("button", { name: /update your pin/i });
    expect(update).toHaveTextContent(/update pin/i);
    act(() => {
      fireEvent.click(update);
    });
    const pins = readPins();
    expect(pins[0].targetDate).toBe(defaultTargetISO());
    expect(pins[0].notes).toBe("keep me");
  });

  it("pushes /mountains/{slug}?target={date} when a day in the strip is picked", () => {
    render(<MountainHeader mountain={rainier} />);
    const keys = dayKeys(blob.gfs!);
    const strip = dayStripDays(keys, defaultTargetISO());
    // Pick an in-range day that is NOT the current target.
    const other = strip.find((d) => d.inRange && d.date !== defaultTargetISO())!;
    const dayBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes(other.label) && b.className.includes("ds-day"))!;
    act(() => {
      fireEvent.click(dayBtn);
    });
    expect(push).toHaveBeenCalledWith(`/mountains/mt-rainier?target=${other.date}`);
  });

  it("has no link to the removed /pin route", () => {
    const { container } = render(<MountainHeader mountain={rainier} />);
    expect(container.querySelector('a[href$="/pin"]')).toBeNull();
  });

  it("links Model Lab and 3D carrying the effective target", () => {
    render(<MountainHeader mountain={rainier} target="2026-06-20" />);
    expect(screen.getByRole("link", { name: /model lab/i })).toHaveAttribute(
      "href",
      "/mountains/mt-rainier/models?target=2026-06-20",
    );
    expect(screen.getByRole("link", { name: /^3D$/i })).toHaveAttribute(
      "href",
      "/mountains/mt-rainier/3d?target=2026-06-20",
    );
  });

  it("tracks pin_added with horizon when pinning", () => {
    render(<MountainHeader mountain={rainier} target="2026-06-22" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /pin this peak/i }));
    });
    expect(track).toHaveBeenCalledWith(
      "pin_added",
      expect.objectContaining({ mountain_slug: rainier.slug, target_horizon_days: 2 }),
    );
  });

  it("tracks pin_removed when unpinning", () => {
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-22", notes: "" });
    render(<MountainHeader mountain={rainier} target="2026-06-22" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /unpin this peak/i }));
    });
    expect(track).toHaveBeenCalledWith("pin_removed", expect.objectContaining({ mountain_slug: rainier.slug }));
  });

  it("tracks model_lab_opened on the Model lab link", () => {
    render(<MountainHeader mountain={rainier} target="2026-06-22" />);
    act(() => {
      fireEvent.click(screen.getByRole("link", { name: /model lab/i }));
    });
    expect(track).toHaveBeenCalledWith("model_lab_opened", expect.objectContaining({ mountain_slug: rainier.slug }));
  });

  it("tracks explore_3d_opened on the 3D link", () => {
    render(<MountainHeader mountain={rainier} target="2026-06-22" />);
    act(() => {
      fireEvent.click(screen.getByRole("link", { name: /^3D$/i }));
    });
    expect(track).toHaveBeenCalledWith("explore_3d_opened", expect.objectContaining({ mountain_slug: rainier.slug }));
  });

  it("tracks target_date_set with horizon when a day in the strip is picked", () => {
    render(<MountainHeader mountain={rainier} />);
    const keys = dayKeys(blob.gfs!);
    const strip = dayStripDays(keys, defaultTargetISO());
    // Pick an in-range day that is NOT the current target so onPick fires.
    const other = strip.find((d) => d.inRange && d.date !== defaultTargetISO())!;
    const dayBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes(other.label) && b.className.includes("ds-day"))!;
    act(() => {
      fireEvent.click(dayBtn);
    });
    expect(track).toHaveBeenCalledWith(
      "target_date_set",
      expect.objectContaining({ mountain_slug: rainier.slug, target_horizon_days: 2 }),
    );
  });
});

describe("MountainHeader hazard chips", () => {
  beforeEach(() => {
    mockHazardsSummary.mockReturnValue({ summary: undefined, isLoading: false, error: null, mutate: vi.fn() });
  });

  it("renders AQI chip when hazards-summary returns aqi data", () => {
    const summary: HazardsSummary = {
      aqi: { value: 85, category: "Moderate" },
      storm: null,
      provenance: { source: "AirNow" },
    };
    mockHazardsSummary.mockReturnValue({ summary, isLoading: false, error: null, mutate: vi.fn() });
    render(<MountainHeader mountain={rainier} target="2026-06-20" />);
    expect(screen.getByText("AQI 85")).toBeTruthy();
  });

  it("clicking Storm chip calls router.replace with tab=safety", () => {
    const summary: HazardsSummary = {
      aqi: null,
      storm: { active: true, label: "Winter Storm Warning" },
      provenance: { source: "NWS" },
    };
    mockHazardsSummary.mockReturnValue({ summary, isLoading: false, error: null, mutate: vi.fn() });
    render(<MountainHeader mountain={rainier} target="2026-06-20" />);
    const stormBtn = screen.getByText("Storm");
    act(() => {
      fireEvent.click(stormBtn);
    });
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("tab=safety"),
      { scroll: false },
    );
  });
});
