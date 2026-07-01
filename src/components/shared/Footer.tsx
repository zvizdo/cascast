/* Footer — quiet global attribution strip (contract §2/§12). Renders on every page. */
import Link from "next/link";

const EOX_FALLBACK =
  "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data)";

export function Footer() {
  const eox = process.env.NEXT_PUBLIC_EOX_ATTRIBUTION || EOX_FALLBACK;
  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer-in">
        <span className="app-footer-kicker">Data sources</span>
        <ul className="app-footer-list">
          <li>
            Weather data by{" "}
            <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
              Open-Meteo.com
            </a>{" "}
            (CC BY 4.0)
          </li>
          <li>Avalanche data © NWAC (Northwest Avalanche Center)</li>
          <li>Snowpack data © USDA NRCS SNOTEL</li>
          <li>{eox}</li>
          <li>3D terrain: USGS 3DEP · routes USFS CC BY 4.0 · © OpenStreetMap contributors</li>
        </ul>
        <Link className="app-footer-link" href="/sources">
          Models &amp; sources
        </Link>
        <Link className="app-footer-link" href="/about">
          About
        </Link>
      </div>
    </footer>
  );
}
