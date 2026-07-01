import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SectionTitle } from "@/components/shared/SectionTitle";

describe("SectionTitle", () => {
  it("renders title with optional kicker and action", () => {
    render(<SectionTitle kicker="Your projects" title="Projects" action={<button>Act</button>} />);
    expect(screen.getByText("Your projects")).toHaveClass("kicker");
    expect(screen.getByText("Projects")).toHaveClass("section-title");
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("omits kicker when not given", () => {
    const { container } = render(<SectionTitle title="Peaks" />);
    expect(container.querySelector(".kicker")).toBeNull();
  });
});
