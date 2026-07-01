/* PanelHead — kicker + serif heading, optional right slot. Ported from app/detail.jsx. */
import * as React from "react";

export interface PanelHeadProps {
  kicker: string;
  title: string;
  right?: React.ReactNode;
}

export function PanelHead({ kicker, title, right }: PanelHeadProps) {
  return (
    <div className="section-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h2 className="section-title">{title}</h2>
      </div>
      {right}
    </div>
  );
}
