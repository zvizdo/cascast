import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import YourMountains from "@/app/your-mountains/page";
import { usePins, removePin } from "@/lib/pins";
import type { Pin } from "@/lib/pins";
import { track } from "@/lib/analytics";

vi.mock("@/lib/pins", () => ({ usePins: vi.fn(), removePin: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const pin: Pin = {
  mountainId: "mt-rainier",
  name: "Mount Rainier",
  targetDate: "2026-06-20",
  notes: "",
  createdAt: "2026-06-14T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(usePins).mockReturnValue([]);
  vi.mocked(track).mockClear();
});

describe("Your Mountains", () => {
  it("shows an empty state with a CTA to the search home when there are no pins", () => {
    render(<YourMountains />);
    expect(screen.getByText(/no pinned mountains/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pin a mountain/i })).toHaveAttribute("href", "/");
  });

  it("renders a tile per pin linking to the focused view", () => {
    vi.mocked(usePins).mockReturnValue([pin]);
    render(<YourMountains />);
    expect(screen.getByText("Mount Rainier")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mount rainier/i })).toHaveAttribute(
      "href",
      "/mountains/mt-rainier?target=2026-06-20",
    );
  });

  it("calls removePin when Remove is clicked", () => {
    vi.mocked(usePins).mockReturnValue([pin]);
    render(<YourMountains />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(removePin).toHaveBeenCalledWith("mt-rainier");
  });

  it("tracks pin_removed when removing a pinned mountain", () => {
    vi.mocked(usePins).mockReturnValue([pin]);
    render(<YourMountains />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(track).toHaveBeenCalledWith("pin_removed", { mountain_slug: "mt-rainier", mountain_name: "Mount Rainier" });
  });
});
