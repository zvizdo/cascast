# About Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static `/about` page that explains Cascast is free and open source ("for the love of the mountains") and invites a donation, reachable from the header nav and footer.

**Architecture:** One static server component at `src/app/about/page.tsx` mirroring the existing `src/app/sources/page.tsx` scaffold (`.page` → `.page-head` → `.card`/`.prose-section`), plus one new `.support-card` CSS rule for the standout donation block. Header and Footer each gain one `/about` link. No data fetching, no new dependencies, no client interactivity.

**Tech Stack:** Next.js 16 App Router (server component), TypeScript, existing global CSS token system, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-06-30-about-page-design.md`

## Global Constraints

- **Adhere to the Cirque design system** — `docs/prototype-ui/prototype-design-review/project/DESIGN.md`. Calm, editorial, cool-alpine. Tokens only, never literals. Serif (Newsreader) headlines, sans (Hanken Grotesk) body, mono kickers. Hairline borders, generous whitespace, restrained motion. Anti-goals: no gradient soup, no decorative emoji, no data slop.
- **Every implementation subagent (Tasks 1–3) MUST invoke the `frontend-design:frontend-design` skill and MUST read DESIGN.md before writing code.** State this verbatim in each dispatch prompt.
- **Confirmed constants (use exactly):** GitHub `https://github.com/zvizdo/cascast` · Donation (Stripe) `https://donate.stripe.com/cNi28t2YleNdeZUbn13cc01`.
- **External links** use `target="_blank"` and `rel="noopener noreferrer"`.
- **Themes:** must render correctly in both `glacier` (light) and `slate` (dark). Reference tokens only so theming is free.
- **Test command:** `npm test -- <path>` (the `test` script already pins `--config config/vitest.config.ts`; a bare `npx vitest` breaks the `@/` alias).
- **Coverage gate:** 90/90/85 lines/functions/branches must stay green (`npm test`).
- **Copy latitude:** the frontend-design worker may refine microcopy for rhythm but MUST preserve the substance, both CTAs, and both links. Tests therefore assert on stable anchors (H1, link hrefs, key terms), not full paragraph text.

---

### Task 1: `/about` page component + support-card styling

**Files:**
- Create: `src/app/about/page.tsx`
- Modify: `src/app/globals.css` (append one `.support-card` rule + its Slate override)
- Test: `src/app/__tests__/about.test.tsx`

**Interfaces:**
- Consumes: existing global classes `.page`, `.page-head`, `.kicker`, `.page-title`, `.page-sub`, `.card`, `.prose-section`, `.btn`, `.btn-primary`, `.btn-ghost`; tokens `--accent`, `--accent-soft`, `--accent-2`, `--line-strong`, `--serif`.
- Produces: a default-exported `AboutPage` server component at route `/about`; a `.support-card` CSS class.

**Dispatch note (required in the subagent prompt):** "Invoke the `frontend-design:frontend-design` skill and read `docs/prototype-ui/prototype-design-review/project/DESIGN.md` before writing any code. Match the calm editorial Cirque aesthetic and the existing `src/app/sources/page.tsx` structure. Use the recommended copy from spec §5; you may polish microcopy but must keep both CTAs and both links."

- [ ] **Step 1: Write the failing test**

Create `src/app/__tests__/about.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import AboutPage from "@/app/about/page";

afterEach(cleanup);

describe("About page", () => {
  it("renders the editorial title", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /for the love of the mountains/i }),
    ).toBeInTheDocument();
  });

  it("explains it is free and open source", () => {
    render(<AboutPage />);
    expect(screen.getAllByText(/open source/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/free/i).length).toBeGreaterThan(0);
  });

  it("links to the GitHub repo, opening in a new tab", () => {
    render(<AboutPage />);
    const link = screen.getByRole("link", { name: /github/i });
    expect(link).toHaveAttribute("href", "https://github.com/zvizdo/cascast");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("has a Donate call-to-action to the Stripe link, opening in a new tab", () => {
    render(<AboutPage />);
    const link = screen.getByRole("link", { name: /donate/i });
    expect(link).toHaveAttribute(
      "href",
      "https://donate.stripe.com/cNi28t2YleNdeZUbn13cc01",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("has a Support section heading", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { name: /support/i })).toBeInTheDocument();
  });

  it("links to the full data-sources page", () => {
    render(<AboutPage />);
    const link = screen.getByRole("link", { name: /source/i });
    expect(link).toHaveAttribute("href", "/sources");
  });

  it("has no axe violations", async () => {
    const { container } = render(<AboutPage />);
    await expectNoA11yViolations(container);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/__tests__/about.test.tsx`
Expected: FAIL — cannot resolve `@/app/about/page` (module does not exist yet).

- [ ] **Step 3: Write the page component**

Create `src/app/about/page.tsx`. Use the recommended copy from spec §5. A correct minimal implementation (the frontend-design worker will refine visual polish in Task 3):

```tsx
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
    <div className="page">
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
```

- [ ] **Step 4: Add the `.support-card` CSS**

Append to `src/app/globals.css` (place near the other card rules; keep tokens only):

```css
/* Support card — the one standout block on the About page. Accent-tinted, accent border. */
.support-card { background: var(--accent-soft); border-color: var(--line-strong); border-left: 3px solid var(--accent); }
.support-card h2 { color: var(--accent); }
[data-theme="slate"] .support-card { background: var(--accent-soft); }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/app/__tests__/about.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Verify build + types**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; `/about` appears in the route list.

- [ ] **Step 7: Commit**

```bash
git add src/app/about/page.tsx src/app/globals.css src/app/__tests__/about.test.tsx
git commit -m "feat: add About page (free/open-source + donation)"
```

---

### Task 2: Link About from the header nav and footer

**Files:**
- Modify: `src/components/layout/Header.tsx` (add nav link after "Your Mountains")
- Modify: `src/components/shared/Footer.tsx` (add About link near "Models & sources")
- Test: `src/components/layout/__tests__/Header.test.tsx`, `src/components/shared/__tests__/Footer.test.tsx`

**Interfaces:**
- Consumes: the `/about` route from Task 1; the `navLink(href, label)` helper in Header; the `.app-footer-link` class in Footer.
- Produces: an "About" nav link (`href="/about"`) in the header; an "About" link (`href="/about"`) in the footer.

**Dispatch note (required in the subagent prompt):** "Invoke the `frontend-design:frontend-design` skill and read `docs/prototype-ui/prototype-design-review/project/DESIGN.md` before editing. This is a surgical nav-wiring change — do not restyle the header or footer."

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/__tests__/Header.test.tsx`, add inside the `describe("Header", …)` block:

```tsx
it("renders an About nav link", () => {
  render(<Header />);
  expect(screen.getByRole("link", { name: /^about$/i })).toHaveAttribute("href", "/about");
});
```

In `src/components/shared/__tests__/Footer.test.tsx`, add inside the `describe("Footer", …)` block:

```tsx
it("links to the About page", () => {
  render(<Footer />);
  expect(screen.getByRole("link", { name: /^about$/i })).toHaveAttribute("href", "/about");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/layout/__tests__/Header.test.tsx src/components/shared/__tests__/Footer.test.tsx`
Expected: FAIL — no link named "About" found.

- [ ] **Step 3: Add the header nav link**

In `src/components/layout/Header.tsx`, inside `<nav className="nav">`, add after the Your Mountains link:

```tsx
{navLink("/your-mountains", "Your Mountains")}
{navLink("/about", "About")}
```

- [ ] **Step 4: Add the footer link**

In `src/components/shared/Footer.tsx`, replace the single Models-&-sources link with both links (keep existing classes):

```tsx
<Link className="app-footer-link" href="/sources">
  Models &amp; sources
</Link>
<Link className="app-footer-link" href="/about">
  About
</Link>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/components/layout/__tests__/Header.test.tsx src/components/shared/__tests__/Footer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Header.tsx src/components/shared/Footer.tsx src/components/layout/__tests__/Header.test.tsx src/components/shared/__tests__/Footer.test.tsx
git commit -m "feat: link About page from header nav and footer"
```

---

### Task 3: Visual-polish critique loop (reviewer ↔ implementer, ≥2 iterations)

The final QA task. A **UI-only** review-and-refine loop: a reviewer subagent critiques the rendered page's visual polish, an implementer subagent applies the fixes, repeat. **Solely visual** — no functional, copy-substance, routing, or test-logic changes. Run **at least 2 full iterations**; continue past 2 only while the reviewer still raises a concrete visual blocker.

**Explicitly in scope for the critique:** spacing/rhythm and vertical alignment, type hierarchy (serif headline vs sans body vs mono kicker per DESIGN.md §4), whitespace and card breathing room, the support-card's prominence and accent treatment in **both** themes, button hierarchy (Donate must read as the dominant CTA; GitHub secondary), hover/motion restraint, link affordances, and responsive layout at desktop (1280×800) and mobile (390×844).

**Explicitly out of scope:** copy substance (the two CTAs and both links stay), routes, component APIs, adding features, and changing test assertions except where a purely visual change (e.g. a heading tag) requires a matching selector update.

- [ ] **Step 1: Start the dev server for live review**

Run (background): `npm run dev`
Confirm `http://localhost:3000/about` responds 200. (If Turbopack panics on `globals.css`, use `npx next dev --webpack` per the CLAUDE.md local-dev note.)

- [ ] **Step 2: Iteration 1 — dispatch the ux-reviewer subagent (visual only)**

Dispatch the `ux-reviewer` agent with this prompt:

> Review ONLY the visual UI polish of the Cascast About page at `http://localhost:3000/about`. Read `docs/prototype-ui/prototype-design-review/project/DESIGN.md` first and judge against it. Use the Playwright browser to load the page and screenshot it at desktop 1280×800 and mobile 390×844, in BOTH themes (toggle `data-theme` between `glacier` and `slate`, or use the header Display menu). Assess: spacing/rhythm, alignment, type hierarchy (serif headline / sans body / mono kicker), whitespace, the support-card's prominence and accent treatment in both themes, button hierarchy (Donate dominant, GitHub secondary), hover/motion restraint, link affordances, and responsive behavior. Report a prioritized list of concrete visual fixes with the exact element and what to change. Do NOT comment on copy substance, functionality, routing, or tests. If the page is already visually polished, say so explicitly and list nothing.

- [ ] **Step 3: Iteration 1 — dispatch the implementer subagent to apply fixes**

Dispatch an implementer (general `claude` agent) with:

> Invoke the `frontend-design:frontend-design` skill and read `docs/prototype-ui/prototype-design-review/project/DESIGN.md` first. Apply ONLY the visual-polish fixes listed below to `src/app/about/page.tsx` and/or `src/app/globals.css` (`.support-card` and About-scoped rules only). Use tokens only — no literals. Do not change copy substance, the two CTAs, both links, routes, or test logic. After editing, run `npm test -- src/app/__tests__/about.test.tsx` and `npx tsc --noEmit` and confirm both are green. Fixes: [paste the reviewer's list].

- [ ] **Step 4: Iteration 2 — repeat Steps 2–3**

Dispatch the `ux-reviewer` again (same prompt) against the updated page, then the implementer again with the new list. This is the mandatory second iteration.

- [ ] **Step 5: Continue if needed**

If the iteration-2 reviewer still raises a concrete visual blocker, run additional reviewer→implementer iterations until the reviewer returns no visual blockers (or the user calls it done). If iteration 2 was already clean, stop.

- [ ] **Step 6: Final verification**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: full suite green (coverage 90/90/85 held), no type errors, build succeeds with `/about` in the route list.

- [ ] **Step 7: Stop the dev server and commit**

```bash
git add -A
git commit -m "polish: About page visual refinements (ux critique loop)"
```

---

## Definition of Done

- `/about` renders the head + four blocks, both themes, desktop + mobile, matching Cirque and passing a frontend-design quality bar.
- About appears in the header nav and the footer.
- GitHub and Donate links work and open in new tabs (`noopener`).
- The visual-polish loop ran ≥2 iterations and ended with no outstanding visual blockers.
- `npm test`, `npx tsc --noEmit`, and `npm run build` are all green.
