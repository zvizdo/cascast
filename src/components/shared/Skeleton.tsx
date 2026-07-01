/* Skeleton — calm Cascast loading placeholders (P6 Task 3). Shimmer respects
   prefers-reduced-motion via CSS (.skeleton animation is zeroed in globals.css).
   Variants: text (lines), card, panel, chart. Each is sized to its content to
   avoid layout shift when the real content arrives. */
import * as React from "react";

export type SkeletonVariant = "text" | "card" | "panel" | "chart";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** number of lines for the text/card/panel variants */
  lines?: number;
  /** testid suffix → data-testid="skeleton-{name}" */
  name?: string;
  className?: string;
}

function Lines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="skeleton skeleton-line"
          style={{ width: i === count - 1 ? "60%" : "100%" }}
        />
      ))}
    </>
  );
}

/** sr-only "Loading…" announced once per skeleton region (the visuals stay decorative). */
function LoadingLabel() {
  return <span className="sr-only">Loading…</span>;
}

export function Skeleton({ variant = "text", lines = 3, name, className }: SkeletonProps) {
  const testId = name ? `skeleton-${name}` : undefined;
  const cls = (base: string) => (className ? `${base} ${className}` : base);

  if (variant === "chart") {
    return (
      <span role="status">
        <LoadingLabel />
        <span data-testid={testId} aria-hidden className={cls("skeleton skeleton-chart")} />
      </span>
    );
  }
  if (variant === "card") {
    return (
      <div role="status">
        <LoadingLabel />
        <div data-testid={testId} aria-hidden className={cls("skeleton-card")}>
          <span className="skeleton skeleton-line" style={{ width: "45%", height: 16 }} />
          <span className="skeleton skeleton-line" style={{ width: "70%", height: 24 }} />
          <Lines count={lines} />
        </div>
      </div>
    );
  }
  if (variant === "panel") {
    return (
      <div role="status">
        <LoadingLabel />
        <div data-testid={testId} aria-hidden className={cls("skeleton-panel")}>
          <span className="skeleton skeleton-line" style={{ width: "35%", height: 18 }} />
          <Lines count={lines} />
          <span className="skeleton skeleton-chart" />
        </div>
      </div>
    );
  }
  return (
    <div role="status">
      <LoadingLabel />
      <div data-testid={testId} aria-hidden className={className}>
        <Lines count={lines} />
      </div>
    </div>
  );
}

/** A grid of card skeletons for the dashboard loading state. */
export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="proj-grid" data-testid="skeleton-dashboard">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  );
}
