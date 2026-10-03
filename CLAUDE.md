# Premise

Structured debate platform where every argument is typed (evidence, analogy, counterexample, etc.) and linked to a parent claim. Live D3.js argument tree; spectators vote per node — not sides. Next.js 16.3.6 + Supabase (BYOS), deployed to Vercel, MIT licensed.

## Stack
- **Language:** TypeScript 6.0.3 — strict mode, `unknown` + narrowing (no `any`)
- **Framework:** Next.js 16.3.6 (App Router, Server Actions)
- **Database:** Supabase (PostgreSQL) — Realtime, RLS, Auth
- **Supabase Client:** @supabase/ssr 0.12.7 — App Router-aware, cookie sessions
- **Visualization:** D3.js 7.9.0 — `d3.tree()` layout, zoom/pan, animated transitions
- **Styling:** Tailwind CSS 4.3.3
- **Animation:** Framer Motion 13.4.4 (UI transitions only; D3 owns tree animations)
- **AI (optional):** @anthropic-ai/sdk 0.128.0 — Haiku argument type classifier

## Build / Test / Run

Use pnpm 10.25.0, pinned by `package.json`, with Node.js 22.12+ on the
22.x line or Node.js 24+ (CI uses Node 22). Install with
`pnpm install --frozen-lockfile`. Effective dependency overrides come from
`pnpm-workspace.yaml`; see README.md for the manifest/lockfile differences.

```bash
pnpm dev          # local dev server
pnpm build        # production build
pnpm lint         # ESLint
pnpm type-check  # TypeScript 6.0.3; tsc --noEmit
pnpm test        # unit tests (Vitest 4.1.11)
pnpm exec playwright test  # Playwright 1.63.0; deployed-site e2e tests
```

The default Playwright configuration targets the deployed site and bypasses
CSP. Configure it for an approved local/test environment before executing tests;
it does not start a local server. See README.md for verification guidance.
CI runs `pnpm test`, `pnpm tsc --noEmit`, and `pnpm build`; lint is separate.

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

Premise is an open-source, structured debate platform where every argument must be categorized by type (evidence, analogy, counterexample, etc.) and linked to a specific parent claim. The result is a live D3.js argument tree where spectators vote on individual nodes — not sides. Built on Next.js 16.3.6 + Supabase (BYOS), deployed to Vercel, MIT licensed.

## Current State

**Phases 0–4 complete — launch-ready.**
Foundation, core debate flow, real-time + voting, auth + discovery, and launch prep are all shipped. See IMPLEMENTATION-ROADMAP.md for full task history and DEPLOY.md for the production runbook.

## Stack

- Language: TypeScript 6.0.3 — strict mode, no `any`
- Framework: Next.js 16.3.6 (App Router, Server Actions)
- Database: Supabase (PostgreSQL) — Realtime, RLS, Auth
- Supabase Client: @supabase/ssr 0.12.7 — App Router-aware, cookie sessions
- Visualization: D3.js 7.9.0 — `d3.tree()` layout, zoom/pan, animated transitions
- Styling: Tailwind CSS 4.3.3
- Animation: Framer Motion 13.4.4 (UI transitions only; D3 handles tree animations)
- AI (optional): @anthropic-ai/sdk 0.128.0 — Haiku argument type classifier

## How To Run

- Run the local development server with `pnpm dev`.

```bash
pnpm dev
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

Phases 0–4 are complete. Confirm production Supabase posture, run Playwright E2E against the deployed Vercel URL, and set production env vars per `DEPLOY.md` before publicly announcing.

<!-- portfolio-context:end -->
