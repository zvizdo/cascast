/**
 * TerrainMap unit tests (mock-based — WebGL/MapLibre excluded from jsdom coverage).
 * Verifies the resize-on-load and ResizeObserver lifecycle fixes (D1) and the
 * setStyle guard (D2). Not counted toward coverage thresholds (map/** excluded).
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Minimal Mountain fixture
// ---------------------------------------------------------------------------
const MOUNTAIN = {
  slug: "mt-rainier",
  name: "Mount Rainier",
  lat: 46.8523,
  lng: -121.7603,
  elevationFt: 14411,
  region: "cascades",
  nwacZoneId: "mt-rainier",
  nwacZoneName: "Mt Rainier",
  snotelStationTriplet: "1050:WA:SNTL",
  snotelStationName: "Paradise",
  description: "",
  state: "WA",
} as const;

// ---------------------------------------------------------------------------
// Mock maplibre-gl BEFORE the component is imported
// ---------------------------------------------------------------------------
type EventHandler = (...args: unknown[]) => void;

function makeMapMock() {
  const handlers: Record<string, EventHandler[]> = {};

  const map = {
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    off: vi.fn(),
    addControl: vi.fn(),
    setStyle: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn(() => undefined),
    getSource: vi.fn(() => undefined),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    // Helper to fire registered event handlers in tests
    __emit: (event: string, ...args: unknown[]) => {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };
  return map;
}

let currentMap: ReturnType<typeof makeMapMock>;

vi.mock("maplibre-gl", () => {
  return {
    default: {
      Map: vi.fn().mockImplementation(() => {
        currentMap = makeMapMock();
        return currentMap;
      }),
      NavigationControl: vi.fn().mockImplementation(() => ({})),
    },
  };
});

// Mock lib/map so we avoid real tile URLs and geopotential math
vi.mock("@/lib/map", () => ({
  terrainMapStyle: vi.fn(() => ({ version: 8, sources: {}, layers: [] })),
  peakCenter: vi.fn(() => ({ lng: -121.76, lat: 46.85, zoom: 10 })),
  gibsSnowDate: vi.fn(() => "2026-06-21"),
}));

// ---------------------------------------------------------------------------
// ResizeObserver mock
// ---------------------------------------------------------------------------
let resizeObserverObserve: ReturnType<typeof vi.fn>;
let resizeObserverDisconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resizeObserverObserve = vi.fn();
  resizeObserverDisconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn().mockImplementation((cb: ResizeObserverCallback) => {
      void cb; // cb stored but not called in unit tests
      return {
        observe: resizeObserverObserve,
        disconnect: resizeObserverDisconnect,
        unobserve: vi.fn(),
      };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks are set up
// ---------------------------------------------------------------------------
async function getTerrainMap() {
  const mod = await import("@/components/map/TerrainMap");
  return mod.TerrainMap;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("TerrainMap — D1: resize on load + ResizeObserver", () => {
  it("calls map.resize() after the load event fires", async () => {
    const TerrainMap = await getTerrainMap();
    render(
      <TerrainMap mountain={MOUNTAIN as never} base="topo" snow={false} />,
    );
    // Fire the mocked 'load' event
    currentMap.__emit("load");
    expect(currentMap.resize).toHaveBeenCalled();
  });

  it("constructs a ResizeObserver and observes the container element", async () => {
    const TerrainMap = await getTerrainMap();
    render(
      <TerrainMap mountain={MOUNTAIN as never} base="topo" snow={false} />,
    );
    expect(ResizeObserver).toHaveBeenCalled();
    expect(resizeObserverObserve).toHaveBeenCalledWith(expect.any(Element));
  });

  it("disconnects the ResizeObserver on unmount", async () => {
    const TerrainMap = await getTerrainMap();
    const { unmount } = render(
      <TerrainMap mountain={MOUNTAIN as never} base="topo" snow={false} />,
    );
    unmount();
    expect(resizeObserverDisconnect).toHaveBeenCalled();
  });
});

describe("TerrainMap — D2: setStyle guard", () => {
  it("does not call setStyle on initial render (no change yet)", async () => {
    const TerrainMap = await getTerrainMap();
    render(
      <TerrainMap mountain={MOUNTAIN as never} base="topo" snow={false} />,
    );
    // setStyle should NOT be called before the map instance exists or when
    // base/snow haven't changed from the initial construction value.
    // The map is created with the initial style; setStyle fires only on changes.
    expect(currentMap.setStyle).not.toHaveBeenCalled();
  });
});
