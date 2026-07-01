/* WeatherIcon — WMO code → line glyph. Ported from app/icons.jsx. */
import * as React from "react";
import { Icons, type IconName, type IconProps } from "./icons";

export interface WeatherIconProps extends IconProps {
  code: number;
}

// WMO code → tint CSS var: snow pale-cyan, rain blue, cloud/fog grey, sun/partly gold.
const WX_TINT: Record<IconName, string> = {
  sun: "--wx-sun",
  partly: "--wx-sun",
  cloud: "--wx-cloud",
  fog: "--wx-cloud",
  rain: "--wx-rain",
  snow: "--wx-snow",
} as Record<IconName, string>;

export function WeatherIcon({ code, style, ...p }: WeatherIconProps): React.ReactElement {
  let k: IconName = "sun";
  if (code >= 71) k = "snow";
  else if (code >= 51) k = "rain";
  else if (code === 45 || code === 48) k = "fog";
  else if (code === 3) k = "cloud";
  else if (code === 1 || code === 2) k = "partly";
  const tint = WX_TINT[k];
  return Icons[k]({ ...p, style: { color: `var(${tint})`, ...style } });
}
