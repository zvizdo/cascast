/* UnitsToggle — three-axis segmented control driving the lib/units store. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import {
  useUnits,
  type TempUnit,
  type WindUnit,
  type DistUnit,
} from "@/lib/units";

export interface UnitsToggleProps {
  className?: string;
}

export function UnitsToggle({ className }: UnitsToggleProps) {
  const temp = useUnits((s) => s.temp);
  const wind = useUnits((s) => s.wind);
  const dist = useUnits((s) => s.dist);
  const setTemp = useUnits((s) => s.setTemp);
  const setWind = useUnits((s) => s.setWind);
  const setDist = useUnits((s) => s.setDist);

  return (
    <div
      className={"units-toggle" + (className ? " " + className : "")}
      role="group"
      aria-label="Display units"
    >
      <Segmented<TempUnit>
        ariaLabel="Temperature units"
        value={temp}
        onChange={setTemp}
        options={[
          { value: "F", label: "°F" },
          { value: "C", label: "°C" },
        ]}
      />
      <Segmented<WindUnit>
        ariaLabel="Wind units"
        value={wind}
        onChange={setWind}
        options={[
          { value: "mph", label: "mph" },
          { value: "kmh", label: "km/h" },
        ]}
      />
      <Segmented<DistUnit>
        ariaLabel="Distance units"
        value={dist}
        onChange={setDist}
        options={[
          { value: "ft", label: "ft" },
          { value: "m", label: "m" },
        ]}
      />
    </div>
  );
}
