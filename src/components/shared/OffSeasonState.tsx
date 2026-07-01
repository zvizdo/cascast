/* OffSeasonState — calm banner for summer / off-season NWAC (DESIGN.md §20). Suppresses
   the danger meter; states when forecasts resume. */
import * as React from "react";
import { Icons } from "@/components/icons/icons";

export interface OffSeasonStateProps {
  /** default copy can be overridden */
  message?: string;
}

export function OffSeasonState({
  message = "Summer operations — no active avalanche forecast (NWAC resumes ~Nov).",
}: OffSeasonStateProps) {
  return (
    <div className="avy-banner" role="status">
      <Icons.alert size={18} />
      <div>{message}</div>
    </div>
  );
}
