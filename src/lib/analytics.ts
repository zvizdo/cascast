/* analytics — typed GA4 event helper. `track` is a safe no-op until GA is
   loaded (window.gtag is defined by <GoogleAnalytics>), so call sites never
   guard. See docs/superpowers/specs/2026-06-20-google-analytics-design.md. */
import { sendGAEvent } from "@next/third-parties/google";

export type AnalyticsEvent =
  | "search_performed"
  | "search_result_selected"
  | "pin_added"
  | "pin_removed"
  | "target_date_set"
  | "share_link_copied"
  | "model_lab_opened"
  | "explore_3d_opened"
  | "elevation_band_changed";
// Tier 2 (documented, not wired yet): units_toggled | theme_toggled |
// daily_outlook_expanded | threed_overlay_toggled | model_selected |
// source_link_clicked | scroll_depth

type Params = Record<string, string | number>;

export function track(event: AnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;
  if (typeof (window as unknown as { gtag?: unknown }).gtag !== "function") return;
  sendGAEvent("event", event, params);
}

export function mountainParams(m: { slug: string; name: string; region: string }) {
  return { mountain_slug: m.slug, mountain_name: m.name, region: m.region };
}

export function horizonDays(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, mo, d] = targetDate.split("-").map(Number);
  const target = new Date(y, mo - 1, d);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}
