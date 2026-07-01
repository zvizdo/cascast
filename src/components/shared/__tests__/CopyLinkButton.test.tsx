import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";

describe("CopyLinkButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("copies the url and shows Copied, then reverts after 2.0s", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyLinkButton url="https://x/y" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith("https://x/y");

    // flush the writeText promise + state update
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText(/copied/i).length).toBeGreaterThan(0);

    // still showing Copied just before the 2.0s window closes
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.queryByText(/share/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText(/share/i)).toBeInTheDocument();
  });

  it("announces Copied via an aria-live status region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyLinkButton url="https://x/y" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await act(async () => {
      await Promise.resolve();
    });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/copied/i);
  });

  it("shows a Press ⌘C fallback when every copy path fails (not silent)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const exec = vi.fn().mockReturnValue(false); // legacy copy also fails
    Object.assign(document, { execCommand: exec });

    render(<CopyLinkButton url="https://x/y" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    // flush the rejected promise + the .catch fallback
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/press ⌘c/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/copy failed/i);
  });

  it("clears the revert timeout on unmount (no setState after unmount)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(<CopyLinkButton url="https://x/y" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("falls back to location.href when no url prop", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyLinkButton />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("uses the legacy execCommand fallback when writeText rejects (permission denied)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const exec = vi.fn().mockReturnValue(true);
    Object.assign(document, { execCommand: exec });

    render(<CopyLinkButton url="https://x/y" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith("https://x/y");

    // flush the rejected promise + the .catch fallback
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(screen.getAllByText(/copied/i).length).toBeGreaterThan(0);
  });

  it("uses the legacy fallback when navigator.clipboard is unavailable", () => {
    Object.assign(navigator, { clipboard: undefined });
    const exec = vi.fn().mockReturnValue(true);
    Object.assign(document, { execCommand: exec });

    render(<CopyLinkButton url="https://x/y" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(screen.getAllByText(/copied/i).length).toBeGreaterThan(0);
  });

  it("has an accessible label", () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    render(<CopyLinkButton />);
    expect(
      screen.getByRole("button", { name: "Copy link to this page" }),
    ).toBeInTheDocument();
  });

  it("calls onCopied on a successful copy", async () => {
    const onCopied = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyLinkButton url="https://x.test/y" onCopied={onCopied} />);
    fireEvent.click(screen.getByRole("button"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it("calls onCopied via the legacy execCommand path when clipboard is unavailable", () => {
    Object.assign(navigator, { clipboard: undefined });
    const exec = vi.fn().mockReturnValue(true);
    Object.assign(document, { execCommand: exec });
    const onCopied = vi.fn();
    render(<CopyLinkButton url="https://x.test/legacy" onCopied={onCopied} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(onCopied).toHaveBeenCalledTimes(1);
  });
});
