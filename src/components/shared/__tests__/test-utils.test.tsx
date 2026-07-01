/* Smoke test for the P6 test harness (renderWithProviders + units reset + axe). */
import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import useSWR from "swr";
import {
  renderWithProviders,
  resetUnits,
  neverResolves,
  expectNoA11yViolations,
} from "./test-utils";
import { useUnits } from "@/lib/units";

beforeEach(() => resetUnits());

function Probe() {
  const { data } = useSWR<string>("/probe");
  return <div>{data ? `loaded:${data}` : "loading"}</div>;
}

describe("test-utils harness", () => {
  it("injects a fallback so SWR resolves synchronously", () => {
    renderWithProviders(<Probe />, { swr: { fallback: { "/probe": "ok" } } });
    expect(screen.getByText("loaded:ok")).toBeInTheDocument();
  });

  it("injects a never-resolving fetcher to keep SWR loading", () => {
    renderWithProviders(<Probe />, { swr: { fetcher: neverResolves } });
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("resetUnits restores defaults", () => {
    useUnits.setState({ temp: "C" });
    resetUnits();
    expect(useUnits.getState().temp).toBe("F");
  });

  it("expectNoA11yViolations passes for accessible markup", async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Title</h1>
        <button type="button">Click</button>
      </main>,
    );
    await expectNoA11yViolations(container);
  });
});
