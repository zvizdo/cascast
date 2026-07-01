/* DrillLink — ghost button/link affordance into the drill-down layer. Ported from app/detail.jsx. */
import * as React from "react";
import Link from "next/link";

export interface DrillLinkProps {
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  prefetch?: boolean;
}

export function DrillLink({ href, onClick, icon, children, prefetch }: DrillLinkProps) {
  if (href) {
    return (
      <Link href={href} prefetch={prefetch} className="drill-link" onClick={onClick}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="drill-link" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
