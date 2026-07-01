---
name: nextjs-patterns
description: Next.js 15/16 App Router expert conventions for this project — async params, uncached fetch defaults, Route Handler caching, server/client boundaries, SWR hybrid pattern
user-invocable: false
---

This project uses Next.js 15+ (App Router). Several breaking changes from v14 apply — always use the v15/16 patterns below.

## Breaking Changes from v14 — Apply These Everywhere

### params and searchParams are now Promises
In Next.js 15+, `params` and `searchParams` in pages/layouts/Route Handlers are async. Always `await` them:

```tsx
// Page component
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // ...
}

// Route Handler
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```

### fetch is uncached by default
In v15+, `fetch()` is **not** cached by default (opposite of v14). Explicitly opt in to caching:

```tsx
// Cache for 5 minutes, revalidate in background
const data = await fetch(url, { next: { revalidate: 300 } })

// Cache indefinitely (use with caution)
const data = await fetch(url, { cache: 'force-cache' })

// Explicitly no cache (same as default now, but explicit)
const data = await fetch(url, { cache: 'no-store' })
```

### cookies() and headers() are async
```tsx
import { cookies, headers } from 'next/headers'

// Must await in v15+
const cookieStore = await cookies()
const headersList = await headers()
```

## Routing & Layouts
- All pages in `app/` directory. Use `layout.tsx` for shared UI, `page.tsx` for routes.
- Use `loading.tsx` for streaming Suspense skeletons and `error.tsx` for error boundaries at route level.
- No `pages/` directory — this is App Router only.
- Dynamic segments: `app/projects/[id]/page.tsx`, `app/mountains/[slug]/page.tsx`.

## Server vs Client Components
- Default to Server Components. Only add `'use client'` when the component needs: `useState`, `useEffect`, browser APIs, event handlers, SWR, Zustand, or D3 DOM manipulation.
- Never call Firestore or Cloud Storage directly from client components — always go through Route Handlers.
- Keep `'use client'` boundaries as deep in the tree as possible — wrap only the interactive leaf, not the whole section.
- Async Server Components fetch data directly: `const data = await fetch(...).then(r => r.json())`.

## Route Handlers
- Live in `app/api/` directory (not a top-level `api/` folder).
- Use `NextResponse.json()` for JSON responses with status codes.
- Apply appropriate Cache-Control on weather endpoints:
  ```ts
  return NextResponse.json(blob, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
  })
  ```
- Route Handler params are `Promise` in v15+ — always `await params`.

## SWR + App Router Hybrid
- SWR is for client-side data that needs real-time revalidation (project cards, last-refreshed timestamps).
- RSC fetch is for initial page load data (mountain metadata, project detail initial state).
- Never use SWR inside a Server Component.
- Configure SWR globally to avoid hammering the API:
  ```tsx
  <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: true }}>
  ```

## Cache Invalidation
- Tag fetch calls for granular revalidation:
  ```tsx
  const data = await fetch(url, { next: { tags: ['projects'], revalidate: 60 } })
  ```
- In Route Handler mutations (POST/PATCH/DELETE), call:
  ```tsx
  import { revalidateTag } from 'next/cache'
  revalidateTag('projects')
  ```

## TypeScript
- Always define prop types with `interface`, never `type` for component props.
- Use `z.infer<typeof schema>` pattern when Zod validates API responses.
- Prefer `unknown` over `any` in catch blocks.
- Route Handler param types must match the v15 Promise pattern (see top section).

## Streaming & Suspense
- Wrap slow data-fetching sections in `<Suspense fallback={<Skeleton />}>` for streaming.
- `loading.tsx` at route level provides automatic Suspense boundary for the whole page.
- For parallel data fetching in a Server Component, use `Promise.all`:
  ```tsx
  const [weather, nwac, snotel] = await Promise.all([
    fetchWeather(id),
    fetchNwac(id),
    fetchSnotel(id),
  ])
  ```

## Error Handling
- `error.tsx` must be a Client Component (`'use client'`). It receives `error` and `reset` props.
- Route Handlers should return typed error responses with appropriate HTTP status codes, not throw.
- Use `notFound()` from `next/navigation` in Server Components when a resource doesn't exist.
