# Premise

Structured debate platform where every argument is typed (evidence, analogy, counterexample, etc.) and linked to a parent claim. Live D3.js argument tree; spectators vote per node — not sides. Next.js 14 + Supabase (BYOS), deployed to Vercel, MIT licensed.

## Stack
- **Language:** TypeScript 5.4+ — strict mode, `unknown` + narrowing (no `any`)
- **Framework:** Next.js 14.2+ (App Router, Server Actions)
- **Database:** Supabase (PostgreSQL) — Realtime, RLS, Auth
- **Supabase Client:** @supabase/ssr 0.4+ — App Router-aware, cookie sessions
- **Visualization:** D3.js 7.9+ — `d3.tree()` layout, zoom/pan, animated transitions
- **Styling:** Tailwind CSS 3.4+
- **Animation:** Framer Motion 11+ (UI transitions only; D3 owns tree animations)
- **AI (optional):** @anthropic-ai/sdk 0.20+ — Haiku argument type classifier

## Build / Test / Run

```bash
pnpm dev          # local dev server
pnpm build        # production build
pnpm lint         # ESLint
npx tsc --noEmit  # type-check
pnpm test         # unit tests (Vitest)
pnpm exec playwright test  # e2e tests
```

## Conventions
- File names: kebab-case. Components: PascalCase.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Server components by default; add `"use client"` only where interactivity requires it.
- Unit tests required for all pure logic: `lib/crux-finder.ts`, `lib/d3/tree-layout.ts`.

## Scoped Gates

**State storage:** Use cookies or Supabase for persistent state. `localStorage` / `sessionStorage` hold ephemeral mirrors only.

**Service role key:** `SUPABASE_SERVICE_ROLE_KEY` is server-only — import only in API routes, never under `/app/` or `/components/`.

**D3 layout:** Use `d3.tree()` (Reingold-Tilford, horizontal LR). Force-directed layout thrashes during live node inserts.

**RLS:** RLS is the primary auth gate; application-layer checks are defense-in-depth only. Enable RLS on every table.

**All Supabase config via env vars:** No hard-coded project URLs or keys.

**AI classifier:** Argument submission must never block on the classifier — it's a UX enhancement, degrades gracefully when `ANTHROPIC_API_KEY` is unset.

**Scope:** Implement only features in the current phase of `IMPLEMENTATION-ROADMAP.md`.

## Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tree layout | `d3.tree()` (Reingold-Tilford), horizontal LR | Deterministic; survives live node inserts without thrash |
| Anonymous identity | httpOnly cookie UUID (30-day) + localStorage mirror | Survives tab close; cookie is canonical |
| Argument length limit | 500 chars, enforced client + Postgres CHECK constraint | Forces concision; longer = split into child node |
| Turn enforcement | Soft turns ("Waiting" badge only, no hard lock) | Hard locks add state machine complexity + bad UX on slow debaters |
| Spectator interaction | Vote only (strong/weak per node), no comments | Comments risk spectators becoming a third debating side |
| Debate conclusion | Mutual agreement or 24h auto-accept; 48h stale = auto-close | Prevents rage-quit exits and zombie debates |
| AI classifier | Optional — degrades gracefully if `ANTHROPIC_API_KEY` unset | Cannot be a hard dependency for BYOS self-hosters |

<!-- portfolio-context:start -->
# Portfolio Context

## What This Project Is

Premise is an open-source, structured debate platform where every argument must be categorized by type (evidence, analogy, counterexample, etc.) and linked to a specific parent claim. The result is a live D3.js argument tree where spectators vote on individual nodes — not sides. Built on Next.js 14 + Supabase (BYOS), deployed to Vercel, MIT licensed.

## Current State

**Phase 0: Foundation**
See IMPLEMENTATION-ROADMAP.md → Phase 0 for exact tasks and acceptance criteria.

## Stack

- Language: TypeScript 5.4+ — strict mode, no `any`
- Framework: Next.js 14.2+ (App Router, Server Actions)
- Database: Supabase (PostgreSQL) — Realtime, RLS, Auth
- Supabase Client: @supabase/ssr 0.4+ — App Router-aware, cookie sessions
- Visualization: D3.js 7.9+ — `d3.tree()` layout, zoom/pan, animated transitions
- Styling: Tailwind CSS 3.4+
- Animation: Framer Motion 11+ (UI transitions only; D3 handles tree animations)
- AI (optional): @anthropic-ai/sdk 0.20+ — Haiku argument type classifier

## How To Run

- Run the local development server with `npm run dev`.

```bash
npm run dev
```

## Known Risks

- Do not use `localStorage` or `sessionStorage` for any persistent state — use cookies or Supabase
- Do not import `SUPABASE_SERVICE_ROLE_KEY` in any file under `/app/` or `/components/` — server API routes only
- Do not use force-directed D3 layout — use `d3.tree()` only; force-directed thrashes during live updates
- Do not add features not in the current phase of IMPLEMENTATION-ROADMAP.md
- Do not hard-code any Supabase project URL or key — all via environment variables
- Do not skip RLS — application-layer auth checks are defense-in-depth only; RLS is the primary gate
- Do not block argument submission on the AI classifier — it's a UX enhancement, never a required step

## Next Recommended Move

Finish the current Phase 0 foundation tasks from `IMPLEMENTATION-ROADMAP.md`, then verify Supabase RLS, cookie identity, and the D3 tree contract before adding later debate features.

<!-- portfolio-context:end -->
