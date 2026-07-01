import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageWrapper } from "@/components/layout/PageWrapper";

describe("PageWrapper", () => {
  it("renders children inside a .page div", () => {
    const { container } = render(
      <PageWrapper>
        <span>content</span>
      </PageWrapper>,
    );
    const page = container.querySelector(".page")!;
    expect(page).toBeTruthy();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("appends a custom className", () => {
    const { container } = render(<PageWrapper className="lab">x</PageWrapper>);
    expect(container.querySelector(".page.lab")).toBeTruthy();
  });
});
