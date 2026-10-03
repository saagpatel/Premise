# Premise

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript)](#) [![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#)

> Structured arguments. Live votes. Find the exact point where two sides disagree.

Premise is an open-source structured debate platform. Two participants argue a claim as a branching tree of typed arguments. A crux-detection algorithm identifies the deepest node where both sides converge and highlights it live. No account required — anonymous participation via cookie identity is fully supported.

## Features

- **Typed argument nodes** — `evidence`, `analogy`, `counterexample`, `reductio`, `authority`, `concession`, `clarification`
- **Live D3 tree** — interactive tree (d3.tree() Reingold-Tilford layout); crux nodes highlighted; stroke weight scales with vote score
- **Weighted voting** — `strong` and `weak` votes update in real time via Supabase Realtime
- **Anonymous participation** — cookie-based identity, no account required; authenticated accounts also supported
- **AI argument classifier** — optional type suggester as you write; uses Anthropic API if `ANTHROPIC_API_KEY` is set, falls back to Ollama if available, or degrades gracefully with no key
- **Invite links** — shareable join links that pre-assign the invited participant to the opposing side

## Quick Start

### Prerequisites
- Node.js 22.x (22.12+) or Node.js 24+ (CI uses Node 22)
- pnpm 10.25.0, pinned by `package.json`
- Supabase project (free tier works)
- Anthropic API key (optional, for AI classifier)

### Installation
```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Usage
```bash
pnpm dev
```

## Verification

Run commands from the repository root after the frozen-lockfile install above.
`pnpm-workspace.yaml` controls effective dependency overrides; preserve it with
the lockfile rather than assuming the duplicated `package.json` overrides win.
Specifically, Vite resolves to 8.0.16 and PostCSS to 8.5.15, although
`package.json` declares 8.3.1 and 8.5.28 respectively; the workspace overrides
and lockfile agree on the effective versions.

```bash
pnpm test lib/crux-finder.test.ts  # focused, deterministic algorithm tests
pnpm test                        # all Vitest tests; Supabase realtime is mocked
pnpm type-check                  # TypeScript; CI invokes the equivalent tsc --noEmit
pnpm lint                        # ESLint; separate from Next build, may report warnings
pnpm build                       # production compilation; also run by CI
```

Unit tests need no Supabase project or AI credentials. Supabase settings are
needed for interactive use; use an approved test project when exercising writes.
There is no separately configured formatter check. CI's test/type/build lanes
are defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

For changed UI behavior, run `pnpm dev` with that test configuration and inspect
the local home/sign-in views and the changed debate tree/crux interaction in a
separate browser profile. Do not submit data to a production Supabase project.
The existing `playwright.config.ts` targets a **deployed** site and bypasses CSP;
its default `pnpm exec playwright test` is not a local smoke or evidence that
production CSP works. Retarget/configure a browser test explicitly for the
approved local environment before using it. Pure documentation changes do not
require browser or provider verification.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.3.6 (App Router, Server Components) |
| Language | TypeScript 6.0.3 |
| UI runtime | React / React DOM 19.3.0 |
| Database + Auth | Supabase (Postgres + Realtime + RLS); @supabase/supabase-js 2.117.2, @supabase/ssr 0.12.7 |
| Visualization | D3 7.9.0 |
| Animation | Framer Motion 13.4.4 |
| Styling | Tailwind CSS 4.3.3 |
| AI client (optional at runtime) | @anthropic-ai/sdk 0.128.0 |
| Tests | Vitest 4.1.11; Playwright 1.63.0 |
| Lint | ESLint 9.39.4; eslint-config-next 16.3.6 |

## Architecture

Argument nodes and votes are stored in Supabase Postgres with row-level security. Supabase Realtime pushes new arguments and authoritative argument score updates directly to the D3 visualization without polling. The crux-detection algorithm traverses the tree from both roots, computing weighted vote convergence at each depth level. The AI classifier runs as a Next.js route handler — streamed, so the type suggestion appears as you type.

## License

MIT
