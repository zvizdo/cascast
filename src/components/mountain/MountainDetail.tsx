/* MountainDetail — the mountains-first detail page, ALWAYS targeted. The ?target=YYYY-MM-DD
   URL param (the `target` prop) defaults to tomorrow via the client clock when absent, so there
   is no longer a browse-vs-focused distinction. The screen is organised into tabs:

   • Forecast: the 7-day daily outlook (highlighting the target day when in range), and — when
     the target is in the forecast window — the freezing-level cross-section, confidence strip,
     snowpack, satellite, editable notes, the forecast-evolution context, and a Model Lab link.
   • Safety: the avalanche panel.

   When the target falls outside the latest forecast window (out of range), the in-range-only
   panels are simply omitted; the daily outlook still renders.

   Reuses the existing project panels verbatim (DailyOutlook / FreezingLevelHero /
   ConfidenceStrip / AvalanchePanel / SnowpackPanel / SatellitePanel / CallChart),
   fed from the mountain-scoped SWR hooks. */
"use client";
import * as React from "react";
import Link from "next/link";
import { Icons } from "@/components/icons/icons";
import { DailyOutlook } from "@/components/project/DailyOutlook";
import { FreezingLevelHero } from "@/components/project/FreezingLevelHero";
import { ConfidenceStrip } from "@/components/project/ConfidenceStrip";
import { AvalanchePanel } from "@/components/project/AvalanchePanel";
import { AirQualityPanel } from "@/components/project/AirQualityPanel";
import { StormPanel } from "@/components/project/StormPanel";
import { VolcanoPanel } from "@/components/project/VolcanoPanel";
import { SeismicPanel } from "@/components/project/SeismicPanel";
import { ParkAlertsPanel } from "@/components/project/ParkAlertsPanel";
import { SnowpackPanel } from "@/components/project/SnowpackPanel";
import { SatellitePanel } from "@/components/project/SatellitePanel";
import { CallChart } from "@/components/project/CallChart";
import { Mountain3DCard } from "@/components/three/Mountain3DCard";
import { TerrainAccess } from "@/components/terrain/TerrainAccess";
import { MountainTabs, type TabDef } from "@/components/mountain/MountainTabs";
import { PinNotes } from "@/components/mountain/PinNotes";
import { PanelHead } from "@/components/shared/PanelHead";
import { Skeleton } from "@/components/shared/Skeleton";
import { SectionError } from "@/components/shared/SectionError";
import { PanelError } from "@/components/shared/PanelError";
import {
  useMountainWeather,
  useMountainSnapshots,
  useMountainNwac,
  useMountainSnotel,
  useMountainSatellite,
  useMountainAirQuality,
  useMountainAlerts,
  useMountainVolcano,
  useMountainSeismic,
  useMountainParkAlerts,
} from "@/lib/hooks";
import { dayKeys } from "@/lib/derive";
import { defaultTargetISO, isInRange } from "@/lib/target-date";
import { chooseFreezingModel, chooseTargetModel, targetRows, modelLabel, noonRow } from "@/lib/forecast-select";
import { weatherProvenance, toProvenanceData } from "@/lib/provenance";
import type { Mountain, NwacForecast } from "@/lib/types";

export interface MountainDetailProps {
  mountain: Mountain;
  /** ?target=YYYY-MM-DD; absent ⇒ client defaults to tomorrow */
  target?: string;
}

export function MountainDetail({ mountain, target }: MountainDetailProps) {
  const slug = mountain.slug;
  const { blob, isLoading: weatherLoading, error: weatherError, mutate: mutateWeather } = useMountainWeather(slug);
  const { snapshots } = useMountainSnapshots(slug);
  const { nwac } = useMountainNwac(slug);
  const { snotel } = useMountainSnotel(slug);
  const { sat } = useMountainSatellite(slug);
  // Safety-tab feeds: each panel is presentational; this parent owns loading/error/omission.
  const { airQuality, isLoading: aqLoading, error: aqError, mutate: aqMutate } = useMountainAirQuality(slug);
  const { alerts, isLoading: stormLoading, error: stormError, mutate: stormMutate } = useMountainAlerts(slug);
  const { volcano, isLoading: volLoading, error: volError, mutate: volMutate } = useMountainVolcano(slug);
  const { seismic, isLoading: seisLoading, error: seisError, mutate: seisMutate } = useMountainSeismic(slug);
  const { parkAlerts, isLoading: parkLoading, error: parkError, mutate: parkMutate } = useMountainParkAlerts(slug);

  // The target always exists: tomorrow by default (client clock).
  const effectiveTarget = target ?? defaultTargetISO();
  const elevations = mountain.elevations;
  const today = new Date().toISOString().slice(0, 10);
  const modelLabHref = `/mountains/${slug}/models?target=${effectiveTarget}`;

  // In-range = the latest forecast actually carries the target day. Out-of-range targets
  // (e.g. >7 days out) simply omit the in-range-only panels.
  const series = blob ? (blob.gfs ?? blob.hrrr ?? blob.ecmwf) : null;
  const inRange = !!blob && !!series && isInRange(dayKeys(series), effectiveTarget);

  // freezing hero: a model that actually carries freezing-level data for the target day.
  const heroKey = inRange && blob ? (chooseFreezingModel(blob, effectiveTarget) ?? chooseTargetModel(blob, effectiveTarget)) : null;
  const heroRows = blob && heroKey ? targetRows(blob[heroKey], effectiveTarget) : [];
  // Freezing level (ft) for the 3D flip overlay: the target day's noon value (else first non-null).
  const heroFreezingFt =
    noonRow(heroRows)?.fl ?? heroRows.map((r) => r.fl).find((v) => v != null) ?? null;

  // Loading the weather feed: show section skeletons.
  if (weatherLoading && !blob) {
    return (
      <div className="detail-body" data-testid="detail-loading">
        <Skeleton variant="panel" name="headline" />
        <Skeleton variant="panel" name="outlook" />
        <div className="detail-grid cols-3">
          <Skeleton variant="panel" name="avalanche" />
          <Skeleton variant="panel" name="snowpack" />
        </div>
      </div>
    );
  }

  // Weather feed failed: a calm per-feed error with retry (mirrors ProjectDetail).
  if (weatherError && !blob) {
    return (
      <div className="detail-body">
        <SectionError message="Couldn't load the daily outlook." onRetry={() => mutateWeather()} />
      </div>
    );
  }

  const forecastTab = (
    <>
      {/* daily outlook — highlights the target day when in range */}
      {blob ? (
        <DailyOutlook
          blob={blob}
          nowIso={new Date().toISOString().slice(0, 16)}
          targetStart={inRange ? effectiveTarget : today}
          targetEnd={inRange ? effectiveTarget : today}
          mountain={{ elevations }}
          modelLabHref={modelLabHref}
        />
      ) : null}

      {/* freezing-level cross-section — in range only. The panel header stays static; only the
          cross-section GRAPHIC flips to a stylized 3D cross-section. */}
      {inRange && heroKey && heroRows.length > 0 && (
        <div className="panel xsection-panel">
          <PanelHead
            kicker="Signature view"
            title="Freezing level cross-section"
            right={<span className="mono-dim">{modelLabel(heroKey)}</span>}
          />
          <Mountain3DCard
            slug={slug}
            target={effectiveTarget}
            mountain={{ name: mountain.name, elevations }}
            freezingFt={heroFreezingFt}
          >
            <FreezingLevelHero
              mountain={{ name: mountain.name, elevations }}
              dayRows={heroRows}
              modelLabel={modelLabel(heroKey)}
              prov={blob ? toProvenanceData(weatherProvenance(blob, heroKey, { variable: "freezing" })) : undefined}
            />
          </Mountain3DCard>
        </div>
      )}

      {/* confidence strip — in range only */}
      {inRange && blob && (
        <ConfidenceStrip blob={blob} targetDate={effectiveTarget} slug={slug} mountain={{ elevations }} />
      )}

      {/* snowpack + snow coverage — paired side-by-side on desktop, stacked on mobile */}
      <div className="detail-grid cols-2">
        <SnowpackPanel snotel={snotel} />
        <SatellitePanel
          sat={sat}
          mountainName={mountain.name}
          imageUrl={`/api/mountains/${slug}/satellite/image`}
        />
      </div>

      {/* the call — convergence band, in range only (never with empty data) */}
      {inRange && snapshots && (
        <div className="panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <PanelHead kicker="The call" title="Is your day's forecast settling?" />
          <CallChart snapshots={snapshots} targetDate={effectiveTarget} />
        </div>
      )}

      <Link href={modelLabHref} className="drill-link" style={{ alignSelf: "flex-start" }}>
        <Icons.sliders size={15} /> Open the Model Lab →
      </Link>

      <PinNotes
        slug={slug}
        name={mountain.name}
        targetDate={effectiveTarget}
        zoneName={mountain.nwacZone}
      />
    </>
  );

  // Per-panel render precedence (graceful degradation, spec §3.2/§7):
  //   1. gated-off (caller passed gated=false)  → omit (nothing)
  //   2. 404 (feed genuinely unavailable here)  → omit (nothing)
  //   3. loading with no data                   → <Skeleton variant="panel">
  //   4. other error (5xx / network)            → <PanelError onRetry={mutate}>
  //   5. otherwise                              → the panel (it renders null if data is null)
  const safetyPanel = (opts: {
    name: string;
    label: string;
    data: unknown;
    isLoading: boolean;
    error: unknown;
    mutate: () => void;
    render: () => React.ReactNode;
    gated?: boolean;
  }): React.ReactNode => {
    if (opts.gated === false) return null;
    const status = (opts.error as { status?: number } | undefined)?.status;
    if (status === 404) return null;
    if (opts.isLoading && !opts.data) return <Skeleton variant="panel" name={opts.name} />;
    if (opts.error) return <PanelError label={opts.label} onRetry={opts.mutate} />;
    return opts.render();
  };

  // Most-actionable-first: AirQuality, Storm, Volcano, Seismic, ParkAlerts, then Avalanche.
  const safetyTab = (
    <div className="safety-stack">
      {safetyPanel({
        name: "air-quality", label: "the air quality", data: airQuality,
        isLoading: aqLoading, error: aqError, mutate: aqMutate,
        render: () => <AirQualityPanel airQuality={airQuality} />,
      })}
      {safetyPanel({
        name: "storm", label: "the storm forecast", data: alerts,
        isLoading: stormLoading, error: stormError, mutate: stormMutate,
        render: () => <StormPanel alerts={alerts} />,
      })}
      {safetyPanel({
        name: "volcano", label: "the volcano status", data: volcano,
        isLoading: volLoading, error: volError, mutate: volMutate,
        gated: !!mountain.hansVolcanoId,
        render: () => <VolcanoPanel volcano={volcano} />,
      })}
      {safetyPanel({
        name: "seismic", label: "recent earthquakes", data: seismic,
        isLoading: seisLoading, error: seisError, mutate: seisMutate,
        render: () => <SeismicPanel seismic={seismic} />,
      })}
      {safetyPanel({
        name: "park-alerts", label: "park alerts", data: parkAlerts,
        isLoading: parkLoading, error: parkError, mutate: parkMutate,
        gated: !!mountain.npsParkCode,
        render: () => <ParkAlertsPanel parkAlerts={parkAlerts} />,
      })}
      <AvalanchePanel nwac={nwac as NwacForecast | { season: "summer" } | null | undefined} />
    </div>
  );

  const terrainTab = <TerrainAccess mountain={mountain} target={effectiveTarget} />;

  const tabs: TabDef[] = [
    { key: "forecast", label: "Forecast", content: forecastTab },
    { key: "safety", label: "Safety", content: safetyTab },
    { key: "terrain", label: "Terrain & Access", content: terrainTab },
  ];

  return (
    <div className="detail-body">
      <MountainTabs tabs={tabs} />
    </div>
  );
}
