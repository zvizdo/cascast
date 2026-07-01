import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VolcanoPanel } from "@/components/project/VolcanoPanel";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { VolcanoStatus } from "@/lib/hazards/types";

const greenNormal: VolcanoStatus = {
  name: "Mount Rainier",
  colorCode: "GREEN",
  alertLevel: "NORMAL",
  nvewsThreat: "Very High Threat",
  noticeUrl: "https://volcanoes.usgs.gov/hans2/notice/12345",
  provenance: {
    source: "USGS HANS",
    observedAt: "2026-06-20T12:00:00Z",
  },
};

const redWarning: VolcanoStatus = {
  name: "Mount St. Helens",
  colorCode: "RED",
  alertLevel: "WARNING",
  nvewsThreat: null,
  noticeUrl: null,
  provenance: {
    source: "USGS HANS",
    observedAt: "2026-06-20T12:00:00Z",
  },
};

describe("VolcanoPanel", () => {
  it("(a) GREEN/NORMAL + nvewsThreat renders alert level text, green dot, and threat text", () => {
    const { container } = render(<VolcanoPanel volcano={greenNormal} />);
    expect(screen.getByText(/NORMAL \/ GREEN/)).toBeInTheDocument();
    expect(screen.getByText(/Very High Threat/)).toBeInTheDocument();
    const dot = container.querySelector(".dot") as HTMLElement | null;
    expect(dot).toBeTruthy();
    expect(dot!.style.background).toBe("var(--d1)");
  });

  it("(b) RED/WARNING → dot background var(--d4)", () => {
    const { container } = render(<VolcanoPanel volcano={redWarning} />);
    const dot = container.querySelector(".dot") as HTMLElement | null;
    expect(dot).toBeTruthy();
    expect(dot!.style.background).toBe("var(--d4)");
  });

  it("(c) noticeUrl present → anchor with href and rel; null → no anchor", () => {
    const { rerender } = render(<VolcanoPanel volcano={greenNormal} />);
    const link = screen.getByRole("link", { name: /latest notice/i });
    expect(link).toHaveAttribute("href", greenNormal.noticeUrl!);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    rerender(<VolcanoPanel volcano={redWarning} />);
    expect(screen.queryByRole("link", { name: /latest notice/i })).toBeNull();
  });

  it("(d) renders a Provenance button matching /HANS/", () => {
    render(<VolcanoPanel volcano={greenNormal} />);
    const btn = screen.getByRole("button", { name: /HANS/i });
    expect(btn).toBeInTheDocument();
  });

  it("(e) renders nothing when volcano is null", () => {
    const { container } = render(<VolcanoPanel volcano={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("(e) renders nothing when volcano is undefined", () => {
    const { container } = render(<VolcanoPanel volcano={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("(f) has no a11y violations", async () => {
    const { container } = render(<VolcanoPanel volcano={greenNormal} />);
    await expectNoA11yViolations(container);
  });

  it("(f) has no a11y violations for RED/WARNING", async () => {
    const { container } = render(<VolcanoPanel volcano={redWarning} />);
    await expectNoA11yViolations(container);
  });
});
