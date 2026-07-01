/* EmptyState — centered icon + title + body + optional CTA. Ported from app/dashboard.jsx .empty. */
import * as React from "react";
import { Icons } from "@/components/icons/icons";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body: string;
  cta?: React.ReactNode;
}

export function EmptyState({ icon, title, body, cta }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon ?? <Icons.pin size={28} />}</div>
      <h2 className="page-title" style={{ marginBottom: 8 }}>
        {title}
      </h2>
      <p className="page-sub" style={{ margin: "0 auto 24px" }}>
        {body}
      </p>
      {cta}
    </div>
  );
}
