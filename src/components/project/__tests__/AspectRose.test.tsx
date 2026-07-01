import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AspectRose } from "@/components/project/AspectRose";

const empty = { N: false, NE: false, E: false, SE: false, S: false, SW: false, W: false, NW: false };

describe("AspectRose", () => {
  it("is an accessible image labelled with affected aspects", () => {
    render(
      <AspectRose
        aspects={{
          upper: { ...empty, N: true, NE: true },
          middle: { ...empty },
          lower: { ...empty },
        }}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAccessibleName(/N|NE/);
  });

  it("labels with no affected aspects gracefully", () => {
    render(<AspectRose aspects={{ upper: empty, middle: empty, lower: empty }} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/no aspects|none/i);
  });

  it("renders 24 sector wedges (8 dirs × 3 bands)", () => {
    const { container } = render(
      <AspectRose aspects={{ upper: empty, middle: empty, lower: empty }} />,
    );
    expect(container.querySelectorAll("path").length).toBe(24);
  });
});
