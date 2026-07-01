/* About — static explainer: free, open source, "for the love of the mountains",
   with a donation ask. Mirrors src/app/sources/page.tsx structure + Cirque tokens. */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Cascast",
  description:
    "Cascast is a free, open-source mountain-weather companion for Washington's alpine. Here's the why — and how you can help keep it running.",
};

const GITHUB_URL = "https://github.com/zvizdo/cascast";
const DONATE_URL = "https://donate.stripe.com/cNi28t2YleNdeZUbn13cc01";

export default function AboutPage() {
  return (
    <div className="page about-page">
      <div className="page-head">
        <div className="kicker">About Cascast</div>
        <h1 className="page-title">For the love of the mountains</h1>
        <p className="page-sub">
          Cascast is a free, open-source weather companion for Washington&rsquo;s
          alpine &mdash; built by people who&rsquo;d rather be climbing than reading
          five forecasts to figure out if they can.
        </p>
      </div>

      <section className="card prose-section">
        <h2>Why this exists</h2>
        <p>
          Planning a day in the Cascades used to mean juggling half a dozen tabs &mdash;
          one model for the freezing level, another for wind, NWAC for avalanche danger,
          SNOTEL for snowpack, a satellite viewer for cloud cover &mdash; and still
          leaving with a fuzzy picture. Cascast pulls all of it into one honest read of
          your window: is it on, and how sure can you be? We built it for ourselves and
          the people we climb with. It&rsquo;s here for you too.
        </p>
      </section>

      <section className="card prose-section">
        <h2>Free, and how it stays free</h2>
        <p>
          Everything here is free to use, and it always will be. The data comes from
          public, freely-licensed sources &mdash; Open-Meteo for the weather models,
          NWAC for avalanche danger, NRCS SNOTEL for snowpack, Copernicus Sentinel-2 for
          satellite imagery. We pay them nothing, and we charge you nothing. What
          isn&rsquo;t free is the plumbing: the servers that pull fresh data every hour,
          render the 3D terrain, and keep the site fast cost a modest amount every
          month. That&rsquo;s the one bill behind Cascast.
        </p>
        <p>
          <Link href="/sources">See every data source &rarr;</Link>
        </p>
      </section>

      <section className="card prose-section">
        <h2>Open source</h2>
        <p>
          Cascast is open source, top to bottom &mdash; the data pipeline, the forecast
          blend, the maps, this page. It&rsquo;s all on GitHub to read, learn from, fork,
          or improve. Spotted a bug, want your local peak added, or have an idea? Open an
          issue or a pull request.
        </p>
        <p>
          <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            View on GitHub &rarr;
          </a>
        </p>
      </section>

      <section className="card prose-section support-card">
        <h2>Support Cascast</h2>
        <p>
          If Cascast helped you catch a weather window &mdash; or turn around before one
          closed &mdash; you can help keep it running. A one-time donation covers a
          stretch of server costs and keeps the forecasts flowing for the next person
          heading up. No account, no subscription, no paywall, ever. Just a thank-you if
          it earned one.
        </p>
        <p>
          <a className="btn btn-primary" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
            Donate
          </a>
        </p>
      </section>
    </div>
  );
}
