# Premise

## Overview
Premise is an open-source, structured debate platform where every argument must be categorized by type (evidence, analogy, counterexample, etc.) and linked to a specific parent claim. The result is a live D3.js argument tree where spectators vote on individual nodes — not sides. Built on Next.js 14 + Supabase (BYOS), deployed to Vercel, MIT licensed.

## Tech Stack
- Language: TypeScript 5.4+ — strict mode, no `any`
- Framework: Next.js 14.2+ (App Router, Server Actions)
- Database: Supabase (PostgreSQL) — Realtime, RLS, Auth
- Supabase Client: @supabase/ssr 0.4+ — App Router-aware, cookie sessions
- Visualization: D3.js 7.9+ — `d3.tree()` layout, zoom/pan, animated transitions
- Styling: Tailwind CSS 3.4+
- Animation: Framer Motion 11+ (UI transitions only; D3 handles tree animations)
- AI (optional): @anthropic-ai/sdk 0.20+ — Haiku argument type classifier

## Development Conventions
- TypeScript strict mode — no `any`, no `!` non-null assertions without comments
- kebab-case for file names, PascalCase for React components
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Server components by default; add `"use client"` only where interactivity requires it
- Service role key NEVER imported in `/app/` or `/components/` — server API routes only
- All Supabase operations wrapped in try/catch with user-visible error handling
- Unit tests for all pure logic: `lib/crux-finder.ts`, `lib/d3/tree-layout.ts`

## Current Phase
**Phase 0: Foundation**
See IMPLEMENTATION-ROADMAP.md → Phase 0 for exact tasks and acceptance criteria.

## Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tree layout algorithm | `d3.tree()` (Reingold-Tilford), horizontal LR | Deterministic layout; survives live node inserts without thrash |
| Anonymous identity | httpOnly cookie UUID (30-day) + localStorage mirror | Survives tab close; cookie is canonical |
| Argument length limit | 500 chars, enforced client + Postgres CHECK constraint | Forces concision; longer = split into child node |
| Turn enforcement | Soft turns (no hard lock, "Waiting" badge only) | Hard locks add state machine complexity + bad UX on slow debaters |
| Spectator interaction | Vote only (strong/weak per node), no comments | Comments risk spectators becoming a third debating side |
| Debate conclusion | Mutual agreement or 24h auto-accept; 48h stale = auto-close | Prevents rage-quit exits and zombie debates |
| AI classifier | Optional — degrades gracefully if ANTHROPIC_API_KEY unset | Cannot be a hard dependency for BYOS self-hosters |

## Do NOT
- Do not use `localStorage` or `sessionStorage` for any persistent state — use cookies or Supabase
- Do not import `SUPABASE_SERVICE_ROLE_KEY` in any file under `/app/` or `/components/` — server API routes only
- Do not use force-directed D3 layout — use `d3.tree()` only; force-directed thrashes during live updates
- Do not add features not in the current phase of IMPLEMENTATION-ROADMAP.md
- Do not hard-code any Supabase project URL or key — all via environment variables
- Do not skip RLS — application-layer auth checks are defense-in-depth only; RLS is the primary gate
- Do not block argument submission on the AI classifier — it's a UX enhancement, never a required step

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
