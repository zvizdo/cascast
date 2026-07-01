import type { Metadata, Viewport } from "next";
import { Newsreader, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/shared/Footer";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Analytics } from "@/components/analytics/Analytics";

const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cascast",
  description: "Unified mountain weather for Washington State hiking and mountaineering.",
};

// Render every route dynamically so <Analytics> reads the runtime-only
// GA_MEASUREMENT_ID per request (static prerender would bake it as null).
export const dynamic = "force-dynamic";

export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="glacier"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      style={
        {
          "--serif": "var(--font-serif), Georgia, serif",
          "--sans": "var(--font-sans), system-ui, sans-serif",
          "--mono": "var(--font-mono), ui-monospace, monospace",
        } as React.CSSProperties
      }
    >
      <head>
        {/* Apply the saved theme before first paint to avoid a flash / aria-pressed mismatch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("cascast.theme");if(t==="slate"||t==="glacier")document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Header />
        <ErrorBoundary>{children}</ErrorBoundary>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
