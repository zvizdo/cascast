/* ElevationBandSelector — Base/Mid/Summit Segmented bound to the shared band store (lib/band).
   Drives the calm layer (DailyOutlook). Default Summit (contract §0 / DESIGN.md §11). */
"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { Segmented } from "@/components/shared/Segmented";
import { Select } from "@/components/shared/Select";
import { useBand, type Band } from "@/lib/band";
import { track } from "@/lib/analytics";

export interface ElevationBandSelectorProps {
  className?: string;
}

const BAND_OPTIONS = [
  { value: "base", label: "Base" },
  { value: "mid", label: "Mid" },
  { value: "summit", label: "Summit" },
] as const;

export function ElevationBandSelector(_props: ElevationBandSelectorProps) {
  const band = useBand((s) => s.band);
  const setBand = useBand((s) => s.setBand);
  const pathname = usePathname();
  const onChange = (b: Band) => {
    setBand(b);
    const slug = pathname?.match(/^\/mountains\/([^/]+)/)?.[1];
    if (slug) track("elevation_band_changed", { mountain_slug: slug, band: b });
  };
  return (
    <>
      <div className="only-desktop">
        <Segmented<Band>
          value={band}
          onChange={onChange}
          ariaLabel="Elevation band"
          options={[...BAND_OPTIONS]}
        />
      </div>
      <div className="only-mobile">
        <Select<Band>
          value={band}
          onChange={onChange}
          ariaLabel="Elevation band"
          options={[...BAND_OPTIONS]}
        />
      </div>
    </>
  );
}
