import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import AboutPage from "@/app/about/page";

afterEach(cleanup);

describe("About page", () => {
  it("renders the editorial title", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /for the love of the mountains/i }),
    ).toBeInTheDocument();
  });

  it("explains it is free and open source", () => {
    render(<AboutPage />);
    expect(screen.getAllByText(/open source/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/free/i).length).toBeGreaterThan(0);
  });

  it("links to the GitHub repo, opening in a new tab", () => {
    render(<AboutPage />);
    const link = screen.getByRole("link", { name: /github/i });
    expect(link).toHaveAttribute("href", "https://github.com/zvizdo/cascast");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("has a Donate call-to-action to the Stripe link, opening in a new tab", () => {
    render(<AboutPage />);
    const link = screen.getByRole("link", { name: /donate/i });
    expect(link).toHaveAttribute(
      "href",
      "https://donate.stripe.com/cNi28t2YleNdeZUbn13cc01",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("has a Support section heading", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { name: /support/i })).toBeInTheDocument();
  });

  it("links to the full data-sources page", () => {
    render(<AboutPage />);
    const link = screen.getByRole("link", { name: /source/i });
    expect(link).toHaveAttribute("href", "/sources");
  });

  it("has no axe violations", async () => {
    const { container } = render(<AboutPage />);
    await expectNoA11yViolations(container);
  });
});
