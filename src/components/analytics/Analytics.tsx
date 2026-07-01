/* Analytics — gated GA4 loader. Server component: reads the runtime-only
   GA_MEASUREMENT_ID (NOT NEXT_PUBLIC_*, which would inline at build time) and
   mounts GoogleAnalytics, which injects gtag.js and auto-fires SPA pageviews.
   Renders nothing when the id is absent (local dev / tests). */
import { GoogleAnalytics } from "@next/third-parties/google";

export function Analytics() {
  const gaId = process.env.GA_MEASUREMENT_ID;
  if (!gaId) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
