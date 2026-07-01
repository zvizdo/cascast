import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ParkAlertsPanel } from "@/components/project/ParkAlertsPanel";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { ParkAlerts } from "@/lib/hazards/types";

const baseProvenance = {
  source: "NPS Alerts API",
  observedAt: "2026-06-20T12:00:00Z",
};

const withAlerts: ParkAlerts = {
  alerts: [
    {
      category: "Closure",
      title: "Westside Road washout",
      description: "Westside Road is closed due to storm damage.",
      url: "https://www.nps.gov/mora/planyourvisit/westside-road.htm",
      parkCode: "mora",
      lastIndexedDate: "2026-06-20",
    },
    {
      category: "Caution",
      title: "Bear activity near Paradise",
      description: "Black bears have been active near Paradise area.",
      url: "https://www.nps.gov/mora/planyourvisit/bears.htm",
      parkCode: "mora",
      lastIndexedDate: "2026-06-20",
    },
  ],
  provenance: baseProvenance,
};

const emptyAlerts: ParkAlerts = {
  alerts: [],
  provenance: baseProvenance,
};

const dangerAlert: ParkAlerts = {
  alerts: [
    {
      category: "Danger",
      title: "Extreme fire hazard",
      description: "Fire danger is extreme.",
      url: "https://www.nps.gov/mora/planyourvisit/fire.htm",
      parkCode: "mora",
      lastIndexedDate: "2026-06-20",
    },
  ],
  provenance: baseProvenance,
};

const informationAlert: ParkAlerts = {
  alerts: [
    {
      category: "Information",
      title: "Visitor center hours changed",
      description: "The visitor center is now open extended hours.",
      url: "https://www.nps.gov/mora/planyourvisit/hours.htm",
      parkCode: "mora",
      lastIndexedDate: "2026-06-20",
    },
  ],
  provenance: baseProvenance,
};

describe("ParkAlertsPanel", () => {
  it("(a) Closure + Caution alerts → both titles render; Closure label uses var(--d3), Caution uses var(--d2)", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={withAlerts} />);

    // Both titles render
    expect(screen.getByText("Westside Road washout")).toBeInTheDocument();
    expect(screen.getByText("Bear activity near Paradise")).toBeInTheDocument();

    // Each title is a link with the correct url and rel
    const closureLink = screen.getByRole("link", { name: /Westside Road washout/ });
    expect(closureLink).toHaveAttribute("href", "https://www.nps.gov/mora/planyourvisit/westside-road.htm");
    expect(closureLink).toHaveAttribute("rel", "noopener noreferrer");

    const cautionLink = screen.getByRole("link", { name: /Bear activity near Paradise/ });
    expect(cautionLink).toHaveAttribute("href", "https://www.nps.gov/mora/planyourvisit/bears.htm");
    expect(cautionLink).toHaveAttribute("rel", "noopener noreferrer");

    // Closure category label uses var(--d3)
    const labels = container.querySelectorAll("[data-category]");
    const closureLabel = Array.from(labels).find((el) => el.textContent === "Closure") as HTMLElement | undefined;
    expect(closureLabel).toBeTruthy();
    expect(closureLabel!.style.color).toBe("var(--d3)");

    // Caution category label uses var(--d2)
    const cautionLabel = Array.from(labels).find((el) => el.textContent === "Caution") as HTMLElement | undefined;
    expect(cautionLabel).toBeTruthy();
    expect(cautionLabel!.style.color).toBe("var(--d2)");
  });

  it("(b) category NAME text is present (not color-only)", () => {
    render(<ParkAlertsPanel parkAlerts={withAlerts} />);
    expect(screen.getByText("Closure")).toBeInTheDocument();
    expect(screen.getByText("Caution")).toBeInTheDocument();
  });

  it("(c) empty alerts:[] → no-alerts copy and no alert rows", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={emptyAlerts} />);
    expect(screen.getByText(/No active park alerts/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".evt").length).toBe(0);
  });

  it("(d) Provenance button matching /NPS/ is rendered", () => {
    render(<ParkAlertsPanel parkAlerts={withAlerts} />);
    const btn = screen.getByRole("button", { name: /NPS/i });
    expect(btn).toBeInTheDocument();
  });

  it("(e) parkAlerts={null} → renders nothing", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("(e) parkAlerts={undefined} → renders nothing", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("(f) has no a11y violations with alerts", async () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={withAlerts} />);
    await expectNoA11yViolations(container);
  });

  it("(f) has no a11y violations in empty state", async () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={emptyAlerts} />);
    await expectNoA11yViolations(container);
  });

  it("Danger category uses var(--d4) token", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={dangerAlert} />);
    const labels = container.querySelectorAll("[data-category]");
    const dangerLabel = Array.from(labels).find((el) => el.textContent === "Danger") as HTMLElement | undefined;
    expect(dangerLabel).toBeTruthy();
    expect(dangerLabel!.style.color).toBe("var(--d4)");
  });

  it("Information category uses var(--accent) token", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={informationAlert} />);
    const labels = container.querySelectorAll("[data-category]");
    const infoLabel = Array.from(labels).find((el) => el.textContent === "Information") as HTMLElement | undefined;
    expect(infoLabel).toBeTruthy();
    expect(infoLabel!.style.color).toBe("var(--accent)");
  });

  it("kicker includes the parkCode in uppercase when alerts are present", () => {
    render(<ParkAlertsPanel parkAlerts={withAlerts} />);
    expect(screen.getByText(/NPS · MORA/)).toBeInTheDocument();
  });

  it("alert row renders a .dot element and contains no emoji characters", () => {
    const { container } = render(<ParkAlertsPanel parkAlerts={withAlerts} />);
    // Each alert row must have a .dot indicator (C5 monochrome dot, not emoji).
    const dots = container.querySelectorAll(".evt .dot");
    expect(dots.length).toBe(withAlerts.alerts.length);

    // The full rendered text of all alert rows must not contain emoji code points.
    const evtEls = container.querySelectorAll(".evt");
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const el of Array.from(evtEls)) {
      expect(emojiRe.test(el.textContent ?? "")).toBe(false);
    }
  });
});
