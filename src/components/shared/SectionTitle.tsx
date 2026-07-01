/* SectionTitle — optional kicker + serif heading, optional right action. Ported from app/shared.jsx. */
import * as React from "react";

export interface SectionTitleProps {
  kicker?: string;
  title: string;
  action?: React.ReactNode;
}

export function SectionTitle({ kicker, title, action }: SectionTitleProps) {
  return (
    <div className="section-head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h2 className="section-title">{title}</h2>
      </div>
      {action}
    </div>
  );
}
