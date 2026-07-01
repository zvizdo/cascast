/* WindArrow — compass bearing → rotatable arrow (wind FROM dir). Ported from app/icons.jsx. */
import * as React from "react";

export interface WindArrowProps {
  /** compass bearing in degrees; default 225 (SW) */
  deg?: number;
  size?: number;
  "aria-label"?: string;
}

export function WindArrow({
  deg = 225,
  size = 16,
  "aria-label": ariaLabel,
}: WindArrowProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ transform: `rotate(${deg}deg)`, display: "inline-block", verticalAlign: "-1px" }}
      role="img"
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path d="M12 3l5 9h-3v9h-4v-9H7z" fill="currentColor" />
    </svg>
  );
}
