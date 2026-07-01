---
name: design-tokens
description: Visual design system, color palette, typography, and component patterns for the mountain weather app — dark alpine aesthetic, avalanche danger colors, model comparison colors, chart defaults
user-invocable: false
---

## Design Philosophy
Dark-mode-first, alpine aesthetic. Deep navy/slate backgrounds, crisp whites, elevation-inspired gradients. The app is used for serious trip planning by mountaineers — avoid playful or cartoonish elements. Data-dense layouts with deliberate breathing room. Every panel should feel like a professional instrument, not a consumer app.

## Color Palette (Tailwind classes)

### Base
- Page background: `bg-slate-950` (near black: #020617)
- Panel/card surface: `bg-slate-900` (#0f172a)
- Elevated surface (inputs, modals): `bg-slate-800` (#1e293b)
- Border: `border-slate-700` (#334155)
- Border subtle: `border-slate-800`

### Text
- Primary: `text-slate-50`
- Secondary: `text-slate-400`
- Muted/labels: `text-slate-500`
- Accent interactive: `text-sky-400`

### Model Comparison Colors (consistent across all charts)
- HRRR: `#38bdf8` (sky-400) — the "ground truth" short-range model
- GFS: `#fbbf24` (amber-400) — medium-range
- ECMWF: `#34d399` (emerald-400) — best global model

### Avalanche Danger Rating Colors (NAC standard, adapted for dark backgrounds)
- 1 Low: `bg-green-600 text-white`
- 2 Moderate: `bg-yellow-500 text-slate-900`
- 3 Considerable: `bg-orange-500 text-white`
- 4 High: `bg-red-600 text-white`
- 5 Extreme: `bg-red-900 text-white`

For colorblind accessibility, always pair color with a numeric label and an icon (shield/warning shapes), never rely on color alone.

### Freezing Level Visualization
- Snow zone (above freezing level): gradient from `sky-200` (#bae6fd) at line to `slate-50` (#f8fafc) at top — cold, icy feel
- Rain zone (below freezing level): `amber-900/30` to `amber-800/10` — warm, earthy
- Freezing level line itself: `#f0f9ff` (sky-50), 2px, dashed

### Precipitation Type Indicators
- Snow: `text-sky-300` + snowflake icon
- Rain: `text-blue-400` + raindrop icon
- Mixed (within 500ft of freezing level): `text-amber-400` + warning icon
- None: `text-slate-500`

### Status Colors
- OK/good: `text-green-400`
- Warning: `text-amber-400`
- Error/alert: `text-red-400`
- Pending/loading: `text-slate-500`

## Typography

### Scale
- Hero numbers (summit temp, danger rating): `text-4xl font-bold font-mono tabular-nums`
- Section title: `text-lg font-semibold text-slate-100`
- Panel label (uppercase, above data): `text-xs font-medium text-slate-400 uppercase tracking-wider`
- Body/description: `text-sm text-slate-300`
- Caption/metadata (last updated, source): `text-xs text-slate-500`

### Fonts
- UI: system font stack (default Tailwind sans)
- Numeric data: `font-mono` for alignment in charts and data tables

## Component Patterns

### Cards
```
bg-slate-900 rounded-2xl border border-slate-800 p-5
hover:border-slate-600 transition-colors cursor-pointer
```

### Section Headers (within project detail)
```
text-xs font-medium text-slate-400 uppercase tracking-wider mb-4
+ optional left accent: border-l-2 border-sky-500 pl-3
```

### Badges / Pills
```
inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
```

### Loading Skeleton
```
animate-pulse bg-slate-800 rounded-lg
```
Use realistic shapes — skeleton a card with `h-6 w-32` for a title, `h-10 w-20` for a big number.

### Empty State
Centered, `text-slate-500`, with a relevant icon and a clear CTA button. Never just "No data."

## Chart Defaults (Recharts)

```tsx
// Standard chart container
<ResponsiveContainer width="100%" height={240}>
  <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
    <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
    <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
    <Tooltip
      contentStyle={{
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        color: '#f1f5f9'
      }}
    />
  </ComposedChart>
</ResponsiveContainer>
```

### Target Date Highlight Band
```tsx
<ReferenceArea
  x1={targetStart}
  x2={targetEnd}
  fill="#0ea5e9"
  fillOpacity={0.08}
  stroke="#0ea5e9"
  strokeOpacity={0.3}
  strokeWidth={1}
/>
```

### Model Lines
```tsx
<Line dataKey="hrrr" stroke="#38bdf8" strokeWidth={2} dot={false} />
<Line dataKey="gfs"  stroke="#fbbf24" strokeWidth={2} dot={false} />
<Line dataKey="ecmwf" stroke="#34d399" strokeWidth={2} dot={false} />
```

## D3 SVG Conventions (Freezing Level Hero, Aspect Rose)
- Always set `role="img"` and `aria-label` on the SVG root.
- Use `viewBox` (not fixed width/height) for responsive scaling.
- Animations: use CSS transitions on `d` attribute via `pathLength`, or React state + `useEffect` with `d3.transition()`.
- Do not use D3's data-join pattern in React — use React state as the source of truth and D3 only for scales and shape generators.

## Mapbox Styling
- Use `mapbox://styles/mapbox/outdoors-v12` as the base style (topographic, mountain-appropriate).
- Override map background to match app dark theme: set `map.setStyle()` with `fog` and `sky` layers removed.
- Mountain pins: custom SVG marker, `fill: #38bdf8` (sky-400), size 32×32px.
