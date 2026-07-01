# Google Analytics (GA4) — Setup & Operations

Design: `docs/superpowers/specs/2026-06-20-google-analytics-design.md`.

## 1. Create the GA4 property
1. analytics.google.com → Admin → Create property (US/Pacific time zone).
2. Add a **Web** data stream for the Cloud Run URL → copy the **Measurement ID** (`G-XXXXXXXXXX`).

## 2. Deploy with the ID
The web app reads a server-only `GA_MEASUREMENT_ID` (NOT `NEXT_PUBLIC_*`). Supply it to Terraform and deploy:

```bash
export TF_VAR_ga_measurement_id="G-XXXXXXXXXX"
terraform -chdir=terraform plan -out=PLAN
terraform -chdir=terraform apply PLAN
```

Empty/unset → `<Analytics />` renders nothing (analytics off). Local dev is off by default; to test locally put `GA_MEASUREMENT_ID=G-XXXX` in `.env.local`.

## 3. Register custom dimensions (one-time, GA4 UI)
Admin → Custom definitions → Create custom dimension. Scope = **Event**. Create one per parameter (name must match exactly):

| Dimension name | Event parameter |
|---|---|
| Mountain slug | `mountain_slug` |
| Mountain name | `mountain_name` |
| Region | `region` |
| Target horizon (days) | `target_horizon_days` |
| Elevation band | `band` |

Until registered, params arrive on events but aren't available as report dimensions.

## 4. Events emitted (Tier 1)
`search_performed`, `search_result_selected`, `pin_added`, `pin_removed`, `target_date_set`, `share_link_copied`, `model_lab_opened`, `explore_3d_opened`, `elevation_band_changed`. Pageviews + engagement/returning-user metrics are automatic.

## 5. Verify
DebugView (Admin → DebugView) shows events in real time. Use the GA Debugger browser extension (or GA4 DebugView) to confirm events fire, or check the **Realtime** report after deploy.
