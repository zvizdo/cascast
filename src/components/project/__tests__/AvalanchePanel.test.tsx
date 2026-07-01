import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AvalanchePanel } from "@/components/project/AvalanchePanel";
import type { NwacForecast } from "@/lib/types";

const aspects = {
  upper: { N: true, NE: true, E: false, SE: false, S: false, SW: false, W: false, NW: true },
  middle: { N: true, NE: false, E: false, SE: false, S: false, SW: false, W: false, NW: false },
  lower: { N: false, NE: false, E: false, SE: false, S: false, SW: false, W: false, NW: false },
};

const winterNwac: NwacForecast = {
  zoneId: "1648",
  zoneName: "West Slopes South",
  season: "winter",
  forecastDate: "2026-02-14",
  publishedTime: "2026-02-14T06:00:00Z",
  expiresTime: "2026-02-15T06:00:00Z",
  danger: {
    current: { upper: 3, middle: 2, lower: 1 },
    tomorrow: { upper: 2, middle: 2, lower: 1 },
  },
  problems: [
    {
      problemId: 1,
      name: "Wind Slab",
      likelihood: "Likely",
      sizeMin: "1",
      sizeMax: "2",
      aspects,
      description: "Fresh wind slabs on lee aspects near ridgelines.",
    },
  ],
  bottomLine: "Considerable danger on upper elevations near ridgetops.",
  hazardDiscussion: "Recent loading has built reactive slabs.",
  weatherDiscussion: "Snow tapering overnight.",
};

describe("AvalanchePanel", () => {
  it("renders danger, bottom line and problems in winter", () => {
    render(<AvalanchePanel nwac={winterNwac} />);
    expect(screen.getByText(/Avalanche danger/)).toBeInTheDocument();
    expect(screen.getByText("Wind Slab")).toBeInTheDocument();
    expect(screen.getByText(winterNwac.bottomLine)).toBeInTheDocument();
    expect(screen.getByText(/Size 1–2/)).toBeInTheDocument();
    expect(screen.getByText("Likely")).toBeInTheDocument();
    expect(screen.getByText(/West Slopes South/)).toBeInTheDocument();
  });

  it("shows Today and Tomorrow danger columns", () => {
    render(<AvalanchePanel nwac={winterNwac} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("shows the summer off-season banner", () => {
    render(<AvalanchePanel nwac={{ season: "summer" }} />);
    expect(screen.getByText(/summer operations/i)).toBeInTheDocument();
  });

  it("shows the off-season banner when nwac is null", () => {
    render(<AvalanchePanel nwac={null} />);
    expect(screen.getByText(/summer operations|no active avalanche/i)).toBeInTheDocument();
  });

  it("expands and collapses the snowpack analysis", () => {
    render(<AvalanchePanel nwac={winterNwac} />);
    expect(screen.queryByText(winterNwac.hazardDiscussion)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /read snowpack analysis/i }));
    expect(screen.getByText(winterNwac.hazardDiscussion)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide snowpack analysis/i }));
    expect(screen.queryByText(winterNwac.hazardDiscussion)).not.toBeInTheDocument();
  });
});
