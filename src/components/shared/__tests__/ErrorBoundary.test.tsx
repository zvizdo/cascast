import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error("kaboom");
  return <div>recovered</div>;
}

beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("shows the calm fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/something went off-route/i)).toBeInTheDocument();
  });

  it("Retry resets the boundary so the subtree re-renders", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went off-route/i)).toBeInTheDocument();
    shouldThrow = false; // next render succeeds
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("supports a custom fallback renderer", () => {
    render(
      <ErrorBoundary fallback={(reset) => <button onClick={reset}>custom reset</button>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "custom reset" })).toBeInTheDocument();
  });
});
