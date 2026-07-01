import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StormPanel } from "@/components/project/StormPanel";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { StormAlerts } from "@/lib/hazards/types";

const baseProvenance = {
  source: "NWS + SPC",
  observedAt: "2026-06-20T18:00:00Z",
};

const activeAlerts: StormAlerts = {
  nws: [
    {
      event: "Severe Thunderstorm Warning",
      severity: "Severe",
      urgency: "Immediate",
      headline: "Severe thunderstorm capable of large hail moving through.",
      onset: "2026-06-20T16:00:00Z",
      expires: "2026-06-20T20:00:00Z",
      areaDesc: "King County",
    },
  ],
  spc: { label: "TSTM", label2: "General Thunderstorms" },
  stormActive: true,
  provenance: baseProvenance,
};

const quietAlerts: StormAlerts = {
  nws: [],
  spc: null,
  stormActive: false,
  provenance: baseProvenance,
};

describe("StormPanel", () => {
  it("(a) renders event + headline with an alert-tone dot for a Severe warning", () => {
    const { container } = render(<StormPanel alerts={activeAlerts} />);
    expect(screen.getByText("Severe Thunderstorm Warning")).toBeInTheDocument();
    expect(screen.getByText(/Severe thunderstorm capable of large hail/)).toBeInTheDocument();
    const dot = container.querySelector(".dot") as HTMLElement | null;
    expect(dot).toBeTruthy();
    expect(dot!.style.background).toBe("var(--alert)");
  });

  it("(a2) expiry shows absolute clock time, not 'just now', for a future expires", () => {
    // expires is 4h in the future from the test run
    const futureExpires = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const alertsWithFuture: StormAlerts = {
      ...activeAlerts,
      nws: [{ ...activeAlerts.nws[0], expires: futureExpires }],
    };
    render(<StormPanel alerts={alertsWithFuture} />);
    // Should render "Until <time>" with digits (e.g. "Until 10:30 PM"), NOT "Until just now"
    const expiryEl = screen.getByText(/until/i);
    expect(expiryEl.textContent).not.toMatch(/just now/i);
    expect(expiryEl.textContent).toMatch(/\d/);
  });

  it("(b) renders SPC Day-1 line with label2 when spc is present", () => {
    render(<StormPanel alerts={activeAlerts} />);
    expect(screen.getByText(/SPC Day-1:/)).toBeInTheDocument();
    expect(screen.getByText(/General Thunderstorms/)).toBeInTheDocument();
  });

  it("(c) shows quiet state when nws is empty and spc is null — no dot", () => {
    const { container } = render(<StormPanel alerts={quietAlerts} />);
    expect(screen.getByText(/No active storm risk\./i)).toBeInTheDocument();
    expect(container.querySelector(".dot")).toBeNull();
  });

  it("(d) renders a Provenance button matching /NWS/", () => {
    render(<StormPanel alerts={activeAlerts} />);
    const btn = screen.getByRole("button", { name: /NWS/i });
    expect(btn).toBeInTheDocument();
  });

  it("(e) renders null when alerts is null", () => {
    const { container } = render(<StormPanel alerts={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("(e) renders null when alerts is undefined", () => {
    const { container } = render(<StormPanel alerts={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("(f) has no a11y violations", async () => {
    const { container } = render(<StormPanel alerts={activeAlerts} />);
    await expectNoA11yViolations(container);
  });

  it("(f) has no a11y violations in quiet state", async () => {
    const { container } = render(<StormPanel alerts={quietAlerts} />);
    await expectNoA11yViolations(container);
  });
});
