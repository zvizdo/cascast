/* Models & sources — a static explainer page. Every <Provenance> popover links here.
   Copy is kept consistent with the reasons in src/lib/provenance.ts (weatherProvenance). */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Models & sources — Cascast",
  description:
    "How Cascast blends weather models (HRRR, GFS, ECMWF) and which external data sources it draws on.",
};

export default function SourcesPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div className="kicker">How the forecast is built</div>
        <h1 className="page-title">Models &amp; sources</h1>
        <p className="page-sub">
          Cascast blends a few numerical weather models and several public data
          sources. Here is what each one is, and how they are combined.
        </p>
      </div>

      <section className="card prose-section">
        <h2>Weather models</h2>
        <p>
          We draw weather from three models. None is best at every range, so we blend them and label
          where each number comes from.
        </p>
        <ul>
          <li>
            <b>HRRR</b> — the High-Resolution Rapid Refresh. The highest-resolution model for the
            near term, but it only runs out to about 48 hours.
          </li>
          <li>
            <b>GFS</b> — the Global Forecast System. A coarser global model that carries the
            forecast beyond HRRR&rsquo;s ~48-hour horizon.
          </li>
          <li>
            <b>ECMWF</b> — the European global model, used to surface model disagreement. It has no
            freezing-level field, so we never read a freezing level from it.
          </li>
        </ul>
        <p>
          <b>The blend rule:</b> for roughly the first 48 hours we use HRRR; beyond that horizon GFS
          carries the forecast. The <b>freezing level</b> always comes from GFS — it is the only
          model with a freezing-level field at this range (HRRR ends ~48&nbsp;h, and ECMWF has no
          freezing-level field). Where a number depends on this choice, the panel says which model
          it came from.
        </p>
      </section>

      <section className="card prose-section">
        <h2>Data sources</h2>
        <p>Current attribution — the live data behind today&rsquo;s panels:</p>
        <ul>
          <li>
            <b>Open-Meteo</b> — weather model output (HRRR, GFS, ECMWF), licensed CC BY 4.0.
          </li>
          <li>
            <b>NWAC</b> — the Northwest Avalanche Center, for avalanche danger and forecasts.
          </li>
          <li>
            <b>NRCS SNOTEL</b> — USDA snowpack telemetry (snow depth, snow-water equivalent).
          </li>
          <li>
            <b>Copernicus / Sentinel-2</b> — true-colour satellite imagery for snow coverage,
            processed via Copernicus Data Space Ecosystem.
          </li>
          <li>
            <b>OpenTopoMap</b> — map style used in the Terrain tab, © OpenStreetMap contributors,
            SRTM · map style © OpenTopoMap (CC-BY-SA).
          </li>
          <li>
            <b>Esri World Imagery</b> — satellite base layer in the Terrain tab · © Esri, Maxar,
            Earthstar Geographics.
          </li>
          <li>
            <b>NASA EOSDIS GIBS — MODIS/Terra snow cover</b> — daily snow-cover overlay in the
            Terrain tab (DOI{" "}
            <a
              href="https://doi.org/10.5067/MODIS/MOD10A1.061"
              target="_blank"
              rel="noopener noreferrer"
            >
              10.5067/MODIS/MOD10A1.061
            </a>
            ).
          </li>
        </ul>
        <p>Planned for later phases:</p>
        <ul>
          <li>
            <b>AirNow</b> — air quality and wildfire smoke.
          </li>
          <li>
            <b>NWS / SPC</b> — National Weather Service and Storm Prediction Center watches and
            warnings.
          </li>
          <li>
            <b>USGS ComCat &amp; HANS</b> — earthquake and volcano-hazard notifications.
          </li>
          <li>
            <b>NPS</b> — National Park Service closures and conditions.
          </li>
          <li>
            <b>USFS</b> — Forest Service trail and road status.
          </li>
          <li>
            <b>OpenStreetMap</b> — trail geometry and points of interest, © OpenStreetMap contributors.
          </li>
        </ul>
      </section>
    </div>
  );
}
