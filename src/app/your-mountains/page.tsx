/* Your Mountains — the user's client-side pins: tiles linking to each focused view. */
"use client";
import * as React from "react";
import Link from "next/link";
import { Icons } from "@/components/icons/icons";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { usePins, removePin } from "@/lib/pins";
import { track } from "@/lib/analytics";

export default function YourMountains() {
  const pins = usePins();

  return (
    <div className="page">
      <div className="dash-head">
        <div className="kicker">Washington Cascades</div>
        <h1 className="page-title">Your mountains</h1>
        <p className="page-sub">Mountains you have pinned, with your target dates.</p>
      </div>

      {pins.length === 0 ? (
        <EmptyState
          icon={<Icons.pin size={28} />}
          title="No pinned mountains yet"
          body="Search for a Washington peak and pin a target date to track its conditions."
          cta={
            <Link href="/" className="btn btn-primary">
              <Icons.search size={16} /> Pin a mountain
            </Link>
          }
        />
      ) : (
        <div className="proj-grid">
          {pins.map((pin) => (
            <div key={pin.mountainId} className="proj-card">
              <Link
                href={`/mountains/${pin.mountainId}?target=${pin.targetDate}`}
                className="pc-top"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="pc-name">
                  <Icons.mountain size={13} /> {pin.name}
                </div>
              </Link>
              <div className="pc-foot">
                <span className="pc-dates">
                  <Icons.calendar size={14} /> {pin.targetDate}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    removePin(pin.mountainId);
                    track("pin_removed", { mountain_slug: pin.mountainId, mountain_name: pin.name });
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
