import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Render a marker instead of the real gtag <Script> so we can assert presence.
vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => <div data-testid="ga" data-ga-id={gaId} />,
}));

import { Analytics } from "../Analytics";

describe("Analytics", () => {
  const original = process.env.GA_MEASUREMENT_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.GA_MEASUREMENT_ID;
    else process.env.GA_MEASUREMENT_ID = original;
  });

  it("renders GoogleAnalytics with the id when GA_MEASUREMENT_ID is set", () => {
    process.env.GA_MEASUREMENT_ID = "G-TEST123";
    const { getByTestId } = render(<Analytics />);
    expect(getByTestId("ga").getAttribute("data-ga-id")).toBe("G-TEST123");
  });

  it("renders nothing when GA_MEASUREMENT_ID is unset", () => {
    delete process.env.GA_MEASUREMENT_ID;
    const { container } = render(<Analytics />);
    expect(container.querySelector('[data-testid="ga"]')).toBeNull();
  });
});
