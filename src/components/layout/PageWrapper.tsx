/* PageWrapper — the .page content container. */
import * as React from "react";

export interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return <div className={"page" + (className ? " " + className : "")}>{children}</div>;
}
