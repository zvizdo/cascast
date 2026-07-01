"use client";
import { Fragment } from "react";
import Link from "next/link";
import { browseGroups } from "@/lib/regions";
import { useUnits, fmtDist, type DistUnit } from "@/lib/units";
import type { Mountain } from "@/lib/types";

export function MountainBrowse({ mountains }: { mountains: Mountain[] }) {
  const dist = useUnits((s) => s.dist);
  const groups = browseGroups(mountains);
  return (
    <div className="browse">
      {groups.map((g, i) => (
        <Fragment key={g.id}>
          <section className="region" aria-labelledby={`region-${g.id}`}>
            <h2 id={`region-${g.id}`} className="region-title">{g.title}</h2>
            <p className="region-note">{g.note}</p>
            {g.subgroups.map((s, j) => (
              <div className="region-sub" key={s.label ?? `sub-${j}`}>
                {s.label && <div className="sub-label">{s.label}</div>}
                <div className="mtn-grid">
                  {s.mountains.map((m) => (
                    <MountainCard key={m.slug} m={m} dist={dist} />
                  ))}
                </div>
              </div>
            ))}
          </section>
          {i < groups.length - 1 && <div className="divider-region" aria-hidden="true" />}
        </Fragment>
      ))}
    </div>
  );
}

function MountainCard({ m, dist }: { m: Mountain; dist: DistUnit }) {
  return (
    <Link href={`/mountains/${m.slug}`} className="mtn-card">
      <div className="mtn-name">{m.name}</div>
      <div className="mtn-elev">
        {fmtDist(m.elevations.summit, dist)} <span className="mtn-elev-tag">summit</span>
      </div>
      <div className="mtn-desc">{m.description}</div>
    </Link>
  );
}
