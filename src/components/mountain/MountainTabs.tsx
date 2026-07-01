/* MountainTabs — WAI-ARIA tablist with roving focus. Modelled on Segmented.tsx.
   URL-param-aware: reads/writes ?tab= so deep-links (e.g. Storm chip → Safety) work. */
"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface TabDef {
  key: string;
  label: string;
  content: React.ReactNode;
}

function resolveKey(tabs: TabDef[], param: string | null, fallback: string): string {
  if (param && tabs.some((t) => t.key === param)) return param;
  return fallback;
}

export function MountainTabs({
  tabs,
  initial,
}: {
  tabs: TabDef[];
  initial?: string;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultKey = initial ?? tabs[0]?.key ?? "";
  const paramKey = searchParams.get("tab");

  // Local state so click/keyboard changes are immediately reflected in the DOM.
  // Initialises from URL param, then stays in sync when the param changes externally
  // (e.g. the Storm chip calls router.replace(...&tab=safety)).
  const [active, setActive] = React.useState(() => resolveKey(tabs, paramKey, defaultKey));

  // Sync to external URL changes (e.g. browser back/forward or deep-link navigation).
  React.useEffect(() => {
    const next = resolveKey(tabs, paramKey, defaultKey);
    setActive(next);
  }, [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const activate = (key: string) => {
    setActive(key);
    // Build new search params, preserving all existing ones.
    const params = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      if (k !== "tab") params.set(k, v);
    }
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const move = (idx: number) => {
    const t = tabs[idx];
    if (!t) return;
    activate(t.key);
    refs.current[idx]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      move(next);
    }
  };

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="mtab-root">
      <div role="tablist" className="mtab-bar">
        {tabs.map((t, i) => {
          const selected = t.key === active;
          const tabId = `mtab-${t.key}`;
          const panelId = `mtab-panel-${t.key}`;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={"mtab-tab" + (selected ? " is-active" : "")}
              onClick={() => activate(t.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {activeTab && (
        <div
          role="tabpanel"
          id={`mtab-panel-${activeTab.key}`}
          aria-labelledby={`mtab-${activeTab.key}`}
          className="mtab-panel"
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
}
