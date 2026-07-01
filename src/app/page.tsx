"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MountainSearch } from "@/components/create/MountainSearch";
import { MountainBrowse } from "@/components/home/MountainBrowse";
import { HeroRidge } from "@/components/home/HeroRidge";
import { useMountains } from "@/lib/hooks";
import type { Mountain } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { mountains } = useMountains();
  const onSelect = (m: Mountain) => router.push(`/mountains/${m.slug}`);

  return (
    <div className="page home">
      <section className="hero">
        <HeroRidge />
        <div className="hero-body">
          <div className="kicker">Free alpine weather · Washington &amp; Oregon</div>
          <h1 className="page-title hero-title">
            Mountain weather for the <em>Pacific Northwest</em>
          </h1>
          <p className="page-sub hero-sub">
            A single, honest read on the Cascades, Olympics, and Oregon volcanoes — freezing level,
            wind, avalanche danger, and snowpack for every major alpine peak. Built entirely on free,
            public data.
          </p>
          <div className="hero-search">
            <MountainSearch
              mountains={mountains ?? []}
              value={null}
              onSelect={onSelect}
              onClear={() => {}}
              minQueryLength={3}
            />
          </div>
          <p className="hero-hint">Know the peak? Jump straight to it — or browse by region below.</p>
          <div className="feat-strip">
            <div className="feat">
              <span className="feat-k">Coverage</span>
              <span className="feat-v">Washington &amp; Oregon alpine peaks</span>
            </div>
            <Link className="feat feat-link" href="/sources">
              <span className="feat-k">Data</span>
              <span className="feat-v">
                Free, public sources <span aria-hidden="true" className="feat-arrow">→</span>
              </span>
            </Link>
            <div className="feat">
              <span className="feat-k">Forecast</span>
              <span className="feat-v">Multiple weather models, blended</span>
            </div>
          </div>
        </div>
      </section>

      <MountainBrowse mountains={mountains ?? []} />
    </div>
  );
}
