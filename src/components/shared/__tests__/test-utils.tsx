/* test-utils — shared P6 test harness. Wraps UIs in an isolated SWRConfig (so tests inject
   fetcher mocks / fallback data / a never-resolving fetcher for loading) and resets the
   persisted units store + localStorage between tests. Re-exports vitest-axe helpers. */
import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { SWRConfig } from "swr";
import { expect } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";

expect.extend(axeMatchers);

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

export { axe };

export interface SwrOverrides {
  /** Custom fetcher (e.g. a vi.fn that rejects, or never resolves for loading). */
  fetcher?: (url: string) => unknown | Promise<unknown>;
  /** Seed SWR cache so hooks resolve synchronously (keyed by request URL). */
  fallback?: Record<string, unknown>;
}

/** A fetcher that never resolves — drives SWR `isLoading` for skeleton tests. */
export const neverResolves = () => new Promise<never>(() => {});

export function renderWithProviders(
  ui: React.ReactElement,
  { swr, ...options }: { swr?: SwrOverrides } & Omit<RenderOptions, "wrapper"> = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          ...(swr?.fetcher ? { fetcher: swr.fetcher } : {}),
          ...(swr?.fallback ? { fallback: swr.fallback } : {}),
        }}
      >
        {children}
      </SWRConfig>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/** Reset the persisted units store + localStorage. Call in `beforeEach`. */
export function resetUnits() {
  localStorage.clear();
  useUnits.setState({ ...DEFAULT_UNITS });
}

/** Assert axe finds no violations in the given container. color-contrast is disabled
   because jsdom cannot compute rendered colors (no canvas / layout). */
export async function expectNoA11yViolations(container: Element) {
  const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results).toHaveNoViolations();
}
