/* ErrorBoundary — catches render-time crashes anywhere below it and shows a calm
   full-page fallback (never a white screen). Retry resets the boundary so the subtree
   re-mounts. Mounted once around {children} in app/layout.tsx (P6 Task 4). */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** optional custom fallback renderer */
  fallback?: (reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface for diagnostics; in prod this would go to an error reporter.
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div className="empty" role="alert">
        <div className="empty-ico">
          <Icons.alert size={28} />
        </div>
        <h1 className="page-title" style={{ fontSize: 30 }}>
          Something went off-route
        </h1>
        <p className="page-sub" style={{ margin: "10px auto 22px" }}>
          An unexpected error interrupted this view. Your data is safe — try again.
        </p>
        <button type="button" className="btn btn-primary" onClick={this.reset}>
          <Icons.refresh size={16} /> Try again
        </button>
      </div>
    );
  }
}
