/* Icons — minimal line SVGs, inherit currentColor. Ported from app/icons.jsx. */
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  /** stroke-width, default 1.6 */
  sw?: number;
}

export type IconComponent = (p: IconProps) => React.ReactElement;

const S = ({ size = 24, sw = 1.6, children, ...p }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
);

export type IconName =
  | "sun"
  | "partly"
  | "cloud"
  | "snow"
  | "rain"
  | "fog"
  | "wind"
  | "thermo"
  | "drop"
  | "flake"
  | "mountain"
  | "pin"
  | "layers"
  | "arrowRight"
  | "arrowLeft"
  | "chevron"
  | "clock"
  | "calendar"
  | "refresh"
  | "link"
  | "search"
  | "alert"
  | "satellite"
  | "sliders"
  | "grid"
  | "check"
  | "compass"
  | "eye"
  | "moon";

export const Icons: Record<IconName, IconComponent> = {
  sun: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </S>
  ),
  partly: (p) => (
    <S {...p}>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.5v1.5M3.2 3.2l1 1M1.5 8H3M13 13.5a3.5 3.5 0 0 0-3.4-3.5 4.5 4.5 0 0 0-8.6 1.8A3 3 0 0 0 4 18h8.5a2.6 2.6 0 0 0 .5-4.5z" />
    </S>
  ),
  cloud: (p) => (
    <S {...p}>
      <path d="M6.5 18A4 4 0 0 1 6 10a5.5 5.5 0 0 1 10.5-1.5A3.8 3.8 0 0 1 17 18z" />
    </S>
  ),
  snow: (p) => (
    <S {...p}>
      <path d="M6.5 14A3.6 3.6 0 0 1 6 6.7a5.2 5.2 0 0 1 10-1.4A3.6 3.6 0 0 1 16.5 14z" />
      <path d="M8 18v.01M12 19v.01M16 18v.01M10 21v.01M14 21v.01" />
    </S>
  ),
  rain: (p) => (
    <S {...p}>
      <path d="M6.5 13A3.6 3.6 0 0 1 6 5.7a5.2 5.2 0 0 1 10-1.4A3.6 3.6 0 0 1 16.5 13z" />
      <path d="M8 17l-1 2.5M12 17l-1 2.5M16 17l-1 2.5" />
    </S>
  ),
  fog: (p) => (
    <S {...p}>
      <path d="M4 9h12M3 13h16M6 17h12" />
    </S>
  ),
  wind: (p) => (
    <S {...p}>
      <path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h9a2 2 0 1 1-2 2" />
    </S>
  ),
  thermo: (p) => (
    <S {...p}>
      <path d="M10 13.5V4a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z" />
      <path d="M12 9v6" />
    </S>
  ),
  drop: (p) => (
    <S {...p}>
      <path d="M12 3s5 5.5 5 9.5a5 5 0 0 1-10 0C7 8.5 12 3 12 3z" />
    </S>
  ),
  flake: (p) => (
    <S {...p}>
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19M12 6l-2.5 2.5M12 6l2.5 2.5M12 18l-2.5-2.5M12 18l2.5 2.5M6 12l2.5-2.5M6 12l2.5 2.5M18 12l-2.5-2.5M18 12l-2.5 2.5" />
    </S>
  ),
  mountain: (p) => (
    <S {...p}>
      <path d="M3 20l6-12 4 7 2-3 6 8z" />
      <path d="M9 8l2.2 3.6" />
    </S>
  ),
  pin: (p) => (
    <S {...p}>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </S>
  ),
  layers: (p) => (
    <S {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5M3 16.5l9 5 9-5" />
    </S>
  ),
  arrowRight: (p) => (
    <S {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </S>
  ),
  arrowLeft: (p) => (
    <S {...p}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </S>
  ),
  chevron: (p) => (
    <S {...p}>
      <path d="M9 6l6 6-6 6" />
    </S>
  ),
  clock: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </S>
  ),
  calendar: (p) => (
    <S {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </S>
  ),
  refresh: (p) => (
    <S {...p}>
      <path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" />
    </S>
  ),
  link: (p) => (
    <S {...p}>
      <path d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1" />
    </S>
  ),
  search: (p) => (
    <S {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </S>
  ),
  alert: (p) => (
    <S {...p}>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 10v4M12 17v.01" />
    </S>
  ),
  satellite: (p) => (
    <S {...p}>
      <path d="M5 11l3-3 4 4-3 3zM12 12l3-3M8 8l3-3 2 2M14 18a4 4 0 0 0 4-4M16 21a7 7 0 0 0 7-7" />
    </S>
  ),
  sliders: (p) => (
    <S {...p}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </S>
  ),
  grid: (p) => (
    <S {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </S>
  ),
  check: (p) => (
    <S {...p}>
      <path d="M4 12l5 5L20 6" />
    </S>
  ),
  compass: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </S>
  ),
  eye: (p) => (
    <S {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </S>
  ),
  moon: (p) => (
    <S {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </S>
  ),
};
