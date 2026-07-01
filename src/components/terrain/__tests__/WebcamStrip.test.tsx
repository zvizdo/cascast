import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WebcamStrip } from "@/components/terrain/WebcamStrip";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { Mountain } from "@/lib/types";

type Webcam = NonNullable<Mountain["webcams"]>[number];

const cam1: Webcam = {
  id: "cam-1",
  label: "Paradise Visitor Center",
  source: "NPS",
  url: "https://example.com/cam1.jpg",
};

const cam2: Webcam = {
  id: "cam-2",
  label: "Camp Muir",
  source: "USGS",
  url: "https://example.com/cam2.jpg",
};

const seasonalCam: Webcam = {
  id: "cam-3",
  label: "Sunrise Visitor Center",
  source: "NPS",
  url: "https://example.com/cam3.jpg",
  seasonal: true,
};

describe("WebcamStrip", () => {
  it("renders two webcam images with src containing url + ?t=<now>", () => {
    render(<WebcamStrip webcams={[cam1, cam2]} now={123} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute("src", "https://example.com/cam1.jpg?t=123");
    expect(imgs[1]).toHaveAttribute("src", "https://example.com/cam2.jpg?t=123");
  });

  it("renders cam labels", () => {
    render(<WebcamStrip webcams={[cam1, cam2]} now={123} />);
    expect(screen.getByText("Paradise Visitor Center")).toBeInTheDocument();
    expect(screen.getByText("Camp Muir")).toBeInTheDocument();
  });

  it("shows 'offline (seasonal)' text for seasonal cams instead of an img", () => {
    render(<WebcamStrip webcams={[seasonalCam]} now={456} />);
    expect(screen.getByText(/offline \(seasonal\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows 'No webcam available' and no img when webcams is undefined", () => {
    render(<WebcamStrip webcams={undefined} />);
    expect(screen.getByText(/No webcam available for this peak\./)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows 'No webcam available' and no img when webcams is empty array", () => {
    render(<WebcamStrip webcams={[]} />);
    expect(screen.getByText(/No webcam available for this peak\./)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("swaps img for 'image unavailable' placeholder on onError", () => {
    render(<WebcamStrip webcams={[cam1]} now={789} />);
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/image unavailable/i)).toBeInTheDocument();
  });

  it("passes axe accessibility check", async () => {
    const { container } = render(<WebcamStrip webcams={[cam1, cam2]} now={123} />);
    await expectNoA11yViolations(container);
  });
});
