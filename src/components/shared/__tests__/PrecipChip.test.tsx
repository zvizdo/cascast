import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrecipChip } from "@/components/shared/PrecipChip";

describe("PrecipChip", () => {
  it.each([
    ["snow", "Snow"],
    ["rain", "Rain"],
    ["mixed", "Mixed"],
    ["chance", "Chance"],
    ["none", "Dry"],
  ] as const)("shows icon + text for %s", (type, label) => {
    const { container } = render(<PrecipChip type={type} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
