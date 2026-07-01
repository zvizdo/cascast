/* MountainHeader — sticky sub-header for the mountain detail page, the always-targeted
   control surface. Owns the effective target (?target=YYYY-MM-DD, defaulting to tomorrow via
   the client clock) and renders the DateSelector day-strip + avalanche HazardChips below the
   title. Pin is a CLIENT-SIDE bookmark (localStorage): a single header button toggles it —
   "Pin" when unpinned, "Pinned ✓"/Unpin when pinned at the current target, "Update pin" when
   pinned at a different target. Share copies the current URL (including ?target); the 3D and
   Model Lab links carry the effective target through. */
"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons/icons";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { DateSelector } from "@/components/mountain/DateSelector";
import { HazardChips, avalancheChip, airQualityChip, stormChip, type HazardChip } from "@/components/mountain/HazardChips";
import { usePins, addPin, removePin, updatePin, getPin } from "@/lib/pins";
import { useMountainWeather, useMountainNwac, useMountainHazardsSummary } from "@/lib/hooks";
import { dayKeys } from "@/lib/derive";
import { defaultTargetISO, dayStripDays } from "@/lib/target-date";
import { track, mountainParams, horizonDays } from "@/lib/analytics";
import type { Mountain } from "@/lib/types";

export interface MountainHeaderProps {
  mountain: Mountain;
  /** ?target=YYYY-MM-DD; absent ⇒ defaults to tomorrow (client clock) */
  target?: string;
}

export function MountainHeader({ mountain, target }: MountainHeaderProps) {
  const router = useRouter();
  const slug = mountain.slug;
  const effectiveTarget = target ?? defaultTargetISO();

  const pins = usePins();
  const pin = pins.find((p) => p.mountainId === slug);

  const { blob } = useMountainWeather(slug);
  const { nwac } = useMountainNwac(slug);
  const { summary } = useMountainHazardsSummary(slug);
  const keys = blob ? dayKeys(blob.gfs ?? blob.hrrr ?? blob.ecmwf!) : [];
  const chips = [
    avalancheChip(nwac),
    airQualityChip(summary),
    stormChip(summary, () => router.replace(`/mountains/${slug}?target=${effectiveTarget}&tab=safety`, { scroll: false })),
  ].filter(Boolean) as HazardChip[];

  const modelLabHref = `/mountains/${slug}/models?target=${effectiveTarget}`;
  const explore3dHref = `/mountains/${slug}/3d?target=${effectiveTarget}`;

  // Pin button: not pinned → Pin (addPin); pinned at this target → Pinned ✓ (removePin);
  // pinned at a different target → Update pin (updatePin → move the pin to this target).
  let pinLabel = "Pin";
  let pinAria = "Pin this peak to track your date";
  let pinGhost = false;
  let onPin = () => {
    addPin({ mountainId: slug, name: mountain.name, targetDate: effectiveTarget, notes: getPin(slug)?.notes ?? "" });
    track("pin_added", { ...mountainParams(mountain), target_horizon_days: horizonDays(effectiveTarget) });
  };
  if (pin && pin.targetDate === effectiveTarget) {
    pinLabel = "Pinned ✓";
    pinAria = "Unpin this peak";
    pinGhost = true;
    onPin = () => {
      removePin(slug);
      track("pin_removed", mountainParams(mountain));
    };
  } else if (pin) {
    pinLabel = "Update pin";
    pinAria = "Update your pin to this date";
    pinGhost = true;
    onPin = () => {
      updatePin(slug, { targetDate: effectiveTarget });
      track("pin_added", { ...mountainParams(mountain), target_horizon_days: horizonDays(effectiveTarget) });
    };
  }

  return (
    <div className="detail-head">
      <div className="detail-head-in">
        <div className="dh-left">
          <Link href="/" className="dh-back" aria-label="Back to search">
            <Icons.arrowLeft size={18} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <div className="dh-title">{mountain.name}</div>
            <div className="dh-meta">
              <span>
                <Icons.mountain size={13} style={{ verticalAlign: -2 }} /> {mountain.region}
              </span>
            </div>
          </div>
        </div>
        <div className="dh-actions">
          <CopyLinkButton onCopied={() => track("share_link_copied", mountainParams(mountain))} />
          <button
            type="button"
            className={`btn ${pinGhost ? "btn-ghost" : "btn-primary"} btn-sm`}
            aria-label={pinAria}
            onClick={onPin}
          >
            <Icons.pin size={15} /> {pinLabel}
          </button>
          <Link
            href={explore3dHref}
            className="btn btn-ghost btn-sm"
            onClick={() => track("explore_3d_opened", mountainParams(mountain))}
          >
            <Icons.compass size={15} /> 3D
          </Link>
          <Link
            href={modelLabHref}
            className="btn btn-ghost btn-sm"
            onClick={() => track("model_lab_opened", mountainParams(mountain))}
          >
            <Icons.sliders size={15} /> Model lab
          </Link>
        </div>
      </div>
      <div className="detail-head-in">
        <div style={{ flex: 1, minWidth: 0 }}>
          <DateSelector
            days={dayStripDays(keys, effectiveTarget)}
            target={effectiveTarget}
            pinned={!!pin}
            onPick={(date) => {
              track("target_date_set", { ...mountainParams(mountain), target_horizon_days: horizonDays(date) });
              router.push(`/mountains/${slug}?target=${date}`);
            }}
          />
          <HazardChips chips={chips} />
        </div>
      </div>
    </div>
  );
}
