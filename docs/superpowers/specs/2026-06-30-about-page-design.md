# About Page — Design Spec

> Date: 2026-06-30
> Status: Approved (brainstorming complete)
> Route: `/about`

A static **About** page for Cascast that explains the project is free and open source —
built "for the love of the mountains" — and invites a donation to cover the one real
cost behind it (servers). Mirrors the existing `/sources` page structure and the Cirque
design system.

---

## 1. Non-negotiable constraints for every implementation worker

Every subagent that touches this feature **must read and adhere to both** of the
following before writing code, and the dispatch prompt must say so explicitly:

1. **The Cirque design system** — `docs/prototype-ui/prototype-design-review/project/DESIGN.md`.
   This page must feel native to Cascast: calm, editorial, cool-alpine. Use tokens
   only (never literals), the three type families for their assigned jobs (serif
   headlines, sans body, mono kickers), hairline borders, generous whitespace,
   restrained motion (cards lift `translateY(-3px)` on hover; no entrance animations).
   Anti-goals from §1 apply: no gradient soup, no decorative emoji, no data slop.
2. **The `frontend-design:frontend-design` skill** — invoke it during implementation to
   produce distinctive, production-grade markup and styling that avoids generic AI
   aesthetics, within the Cirque token system.

These two are complementary: Cirque is the fixed visual vocabulary; frontend-design is
the craft standard for assembling it. Neither overrides the other.

---

## 2. Goal & success criteria

- A user reaches `/about` from the top nav **and** the footer.
- The page tells the "why" honestly, explains how it stays free, states it is open
  source with a working GitHub link, and presents a tasteful, standout donation CTA.
- It is visually indistinguishable in quality/feel from `/sources` and the rest of
  Cascast, in **both** Glacier and Slate themes, desktop and mobile.
- Quality gates stay green (build, unit tests ≥90/90/85, vitest-axe clean).

---

## 3. Architecture

A single static **server component**, mirroring `src/app/sources/page.tsx`:

- **File:** `src/app/about/page.tsx`
- Exports static `metadata` (`title: "About — Cascast"`, a one-line description).
- Uses the existing page scaffold classes: `.page` → `.page-head` (`.kicker`,
  `.page-title`, `.page-sub`) → a stack of `.card`/`.prose-section` blocks.
- No data fetching, no client interactivity, no new dependencies. The donation and
  GitHub buttons are plain `<a>` links (`target="_blank"`, `rel="noopener noreferrer"`).

**Single new CSS rule:** a `.support-card` class in `src/app/globals.css` for the
standout donation card — an accent-tinted surface with an accent border, themed for
both `glacier` and `slate` via existing tokens (`--accent`, `--accent-soft`,
`--line-strong`). No other global CSS changes.

**Constants (fill-in values, already confirmed):**
- GitHub: `https://github.com/zvizdo/cascast`
- Donation (Stripe): `https://donate.stripe.com/cNi28t2YleNdeZUbn13cc01`

---

## 4. Page information architecture

Top-to-bottom, all within `.page`:

```
page-head
  kicker      ABOUT CASCAST
  page-title  For the love of the mountains
  page-sub    one-line mission

card (prose)  Why this exists            ← the story / why
card (prose)  Free, and how it stays free ← free sources named; servers are the one cost
card (prose)  Open source                 ← [View on GitHub →] + contribute invite
support-card  Support Cascast             ← standout: donation ask + [Donate] button
```

The support card is **last** (natural reading endpoint after the reader understands
the value and the cost) and is the only visually distinct block on the page.

---

## 5. Copy (recommended draft)

The copy below is the recommended draft, grounded in donation-copy research (see §9):
second person, one concrete story, transparency about the single real cost, a specific
ask tied to that cost, simple language, and an "if it helped you" framing that fits a
passion project rather than a hard-urgency nonprofit pitch. The frontend-design worker
may refine microcopy for rhythm but **must preserve the substance, the CTAs, and the
two links**.

**Head**
- Kicker: `ABOUT CASCAST`
- Title: `For the love of the mountains`
- Sub: `Cascast is a free, open-source weather companion for Washington's alpine — built by people who'd rather be climbing than reading five forecasts to figure out if they can.`

**Card — Why this exists**
> Planning a day in the Cascades used to mean juggling half a dozen tabs — one model
> for the freezing level, another for wind, NWAC for avalanche danger, SNOTEL for
> snowpack, a satellite viewer for cloud cover — and still leaving with a fuzzy
> picture. Cascast pulls all of it into one honest read of your window: is it on, and
> how sure can you be? We built it for ourselves and the people we climb with. It's
> here for you too.

**Card — Free, and how it stays free**
> Everything here is free to use, and it always will be. The data comes from public,
> freely-licensed sources — Open-Meteo for the weather models, NWAC for avalanche
> danger, NRCS SNOTEL for snowpack, Copernicus Sentinel-2 for satellite imagery. We
> pay them nothing, and we charge you nothing. What isn't free is the plumbing: the
> servers that pull fresh data every hour, render the 3D terrain, and keep the site
> fast cost a modest amount every month. That's the one bill behind Cascast.
>
> (inline link: "See every data source →" → `/sources`)

**Card — Open source**
> Cascast is open source, top to bottom — the data pipeline, the forecast blend, the
> maps, this page. It's all on GitHub to read, learn from, fork, or improve. Spotted a
> bug, want your local peak added, or have an idea? Open an issue or a pull request.
>
> Button: `View on GitHub →` → `https://github.com/zvizdo/cascast`

**Support card — Support Cascast**
> If Cascast helped you catch a weather window — or turn around before one closed — you
> can help keep it running. A one-time donation covers a stretch of server costs and
> keeps the forecasts flowing for the next person heading up. No account, no
> subscription, no paywall, ever. Just a thank-you if it earned one.
>
> Button: `Donate` → `https://donate.stripe.com/cNi28t2YleNdeZUbn13cc01`

---

## 6. Navigation wiring

- **Header** (`src/components/layout/Header.tsx`): add `{navLink("/about", "About")}`
  to the `<nav>`, after "Your Mountains". Inherits active-state highlighting and
  `aria-current` from the existing `navLink` helper — no other header changes.
- **Footer** (`src/components/shared/Footer.tsx`): add an `About` `<Link>` alongside the
  existing "Models & sources" link (same `.app-footer-link` treatment).

---

## 7. Styling

- Reuse existing tokens/classes: `.page`, `.page-head`, `.kicker`, `.page-title`,
  `.page-sub`, `.card`, `.prose-section`, `.btn`, `.btn-primary`, `.btn-ghost`.
- New `.support-card`: accent-tinted background (`--accent-soft`), a stronger accent
  border, comfortable internal padding consistent with `.card` (24px), with a Slate
  override so it reads on dark grounds. The Donate button is `btn-primary`.
- The GitHub button is a `btn-ghost` (secondary to the donation CTA, so the page has a
  single dominant call to action).
- Respect `prefers-reduced-motion` (inherited; add no new motion beyond token hovers).

---

## 8. Accessibility

- Real `<a>`/`<button>` semantics; external links carry `rel="noopener noreferrer"` and
  visually-communicated "opens in new tab" is acceptable via the `→` affordance (no
  icon-only ambiguity).
- Headings form a correct outline (`h1` in head, `h2` per card).
- Color is never the only signal — the support card is distinguished by border + heading
  + button, not hue alone.
- Contrast meets ~AA against tinted surfaces in both themes.
- `vitest-axe` finds zero violations.

---

## 9. Testing (per the 90/90/85 gate)

- **New** `src/app/__tests__/about.test.tsx` (mirrors `sources.test.tsx`):
  - Renders the title and each card heading.
  - The GitHub link's `href` is exactly `https://github.com/zvizdo/cascast`, with
    `target="_blank"` and `rel` containing `noopener`.
  - The Donate link's `href` is exactly the Stripe URL, with `target="_blank"` and
    `rel` containing `noopener`.
  - The `/sources` inline link is present.
  - `vitest-axe` `toHaveNoViolations`.
- **Update** `Header` and `Footer` tests to assert the new `/about` links exist.
- No new e2e is required (static page). Optionally extend an existing nav-smoke spec.

**Copy-research sources** informing §5:
- <https://teamallegiance.com/resources/how-to-write-an-effective-fundraising-letter-or-email/>
- <https://www.qgiv.com/blog/dos-donts-copywriting-nonprofits/>
- <https://xyflow.com/blog/asking-for-money-for-open-source>
- <https://opensource.com/business/13/7/donations-open-source-projects>

---

## 10. Out of scope (YAGNI)

- No CMS/markdown source, no i18n.
- No donation analytics/tracking events, suggested amounts, or amount tiers (the Stripe
  page handles amounts).
- No sticky/repeated donate button, no contributor list, no changelog.
- No changes to the data pipeline, API, or any other route.

---

## 11. Definition of done

- `/about` renders all four blocks + head, both themes, desktop + mobile, matching
  Cirque and passing a frontend-design quality bar.
- About appears in the header nav and the footer.
- GitHub and Donate links work and open in new tabs.
- `npm run build`, `npm test` (coverage held), and vitest-axe are green.
