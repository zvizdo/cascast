/* PendingState — first-refresh state (spec §5). Mono kicker, muted body, no fake numbers. */
import * as React from "react";

export interface PendingStateProps {
  /** mono uppercase kicker, e.g. "The call for your window" */
  kicker: string;
  /** serif headline copy */
  body?: string;
  /** override the serif size (detail uses 22, card uses smaller) */
  size?: number;
}

export function PendingState({
  kicker,
  body = "Gathering the first forecast — check back in a minute.",
  size = 22,
}: PendingStateProps) {
  return (
    <div className="panel" role="status">
      <div className="kicker">{kicker}</div>
      <p style={{ fontFamily: "var(--serif)", fontSize: size, margin: "10px 0 0" }}>{body}</p>
    </div>
  );
}
