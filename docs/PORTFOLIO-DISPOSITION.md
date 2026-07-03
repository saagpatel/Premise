# Premise — Portfolio Disposition

**Status:** Release Frozen — Next.js 15 + Supabase + D3 structured
debate platform on `origin/main`, with operator-shipped `DEPLOY.md`
and `SETUP.md`, Playwright E2E targeting deployed Vercel URL, CSP
middleware + HTTP security headers, in-memory rate limiting, GHSA-
patched dependencies, and Lighthouse-optimized SEO/a11y/performance.
**Third member of the static-host cluster** — but the first
sub-shape with a real backend (Supabase) and SSR (Next.js RSC),
distinct from PomGambler (PWA + OpenAPI) and HowMoneyMoves (pure
static SPA).

> Disposition uses strict `origin/main` verification.
> **Expands the static-host cluster** with a Vercel + Supabase
> Next.js sub-shape distinct from PWA and static-SPA.

---

## Verification posture

This repo has **only `origin`** (`saagpatel/Premise`) — no
`legacy-origin` remote. Clean migration state. Local clone's `main`
is tracking `origin/main` correctly.

Specifically verified on `origin/main`:

- Tip: `baada88` fix: forward CSP nonce to RSC scripts for proper
  hydration
- Substantive commits on `origin/main` (production-ready cadence):
  - `baada88` fix: forward CSP nonce to RSC scripts for proper hydration
  - `2cdfdf6` feat: add Playwright E2E smoke tests targeting deployed Vercel URL
  - `5dc2b61` fix: upgrade Next.js 15.5.14 → 15.5.15 to patch GHSA-q4gf-8mx6-v5v3
  - `18c0fa7` perf: fix Lighthouse audit findings (SEO, a11y, performance)
  - `2ddf050` fix: pin pnpm version for Vercel compatibility
  - `3ec74f9` fix: correct auth callback redirect path
  - `8436d76` fix(security): add in-memory rate limiting to API routes
  - `ff4d8c4` fix(security): add CSP middleware and HTTP security headers
  - `7f9198b` feat(classify): add Ollama fallback for AI argument classifier
- **Release-ready artifacts shipped on canonical main:**
  - `DEPLOY.md` (Vercel deploy runbook: Supabase setup + Vercel
    setup + verification steps)
  - `SETUP.md`
  - `e2e/` (Playwright tests)
  - `middleware.ts` (Next.js CSP middleware)
  - `playwright.config.ts`
  - `next.config.mjs`, `eslint.config.js`, `pnpm-lock.yaml`
- Default branch: `main`

---

## Current state in one paragraph

Premise is a Next.js 15 + Supabase + D3 structured debate platform.
Per memory: Phases 0-4 complete, launch-ready. Per canonical main
README + DEPLOY: real-time debate participation via Supabase
realtime, anonymous voting, AI argument classifier (with Ollama
fallback for the operator-runs-locally case + Anthropic API for the
hosted case), CSP middleware on Next.js RSC with nonce forwarding
for hydration, in-memory rate limiting on API routes, Lighthouse-
optimized SEO / a11y / performance, Playwright E2E **targeting the
deployed Vercel URL** (i.e. canary-style live smoke tests). The
`DEPLOY.md` runbook explicitly walks Supabase project creation +
Vercel deployment + verification. This is launch-ready in a way
that PomGambler and HowMoneyMoves are not — the operator has
production security hardening commits + GHSA-patched deps.

For full detail see:
- `README.md` on `origin/main`
- `DEPLOY.md` (Vercel + Supabase deploy runbook)
- `SETUP.md`
- `IMPLEMENTATION-ROADMAP.md`

---

## Why "Release Frozen (static-host with Supabase backend)" — NOT signing cluster

Premise is web-distributed via Vercel:

- **Next.js 15 (App Router + RSC)** — server-side rendering, not
  static
- **Supabase backend** — Postgres + auth + realtime; Premise is
  not a pure static SPA
- **`vercel`-pinned pnpm** (`fix: pin pnpm version for Vercel
  compatibility`) — Vercel is the deploy target
- **Playwright E2E against the deployed Vercel URL** — operator
  treats Vercel as production
- **No Apple credentials, no .app, no .dmg** — different planet
  from signing cluster

The "gate" is the same shape as PomGambler / HowMoneyMoves but with
backend-attached concerns: Supabase project on production tier,
Supabase RLS policies validated, Anthropic API key (or Ollama
endpoint) production-ready.

This is the **third static-host cluster member**, but a **new sub-
shape** within it: **Vercel + Supabase + Next.js RSC**, distinct
from PWA (PomGambler) and pure static SPA (HowMoneyMoves).

---

## Static-host cluster taxonomy

| Member | Sub-shape | Backend |
|---|---|---|
| PomGambler | PWA (service worker + manifest) | OpenAPI surface (operator decides host) |
| HowMoneyMoves | Static SPA (no SW, no manifest) | None — pure content |
| **Premise** | **SSR + RSC (Next.js 15)** | **Supabase** (Postgres + auth + realtime) |

The cluster now has three distinguishable sub-shapes. Future
candidates (Vercel-hosted Next.js with Supabase) should batch with
Premise; future PWAs should batch with PomGambler; future static
SPAs should batch with HowMoneyMoves.

---

## Unblock trigger (operator)

When ready to ship publicly:

1. **Confirm Supabase production posture.** RLS policies, anon
   keys, service-role-key not exposed, database migrations applied.
   `DEPLOY.md` references the env vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `ANTHROPIC_API_KEY`).
2. **Custom domain + TLS via Vercel.** Vercel handles TLS by
   default.
3. **Run Playwright E2E against the production Vercel URL** before
   announcing.
4. **Confirm rate limiting tier.** The `8436d76 fix(security): add
   in-memory rate limiting` commit suggests per-instance limits;
   verify this is sufficient for expected traffic, or upgrade to
   Upstash Redis / similar for distributed limiting if Vercel
   serverless scales out.
5. **AI provider posture.** Ollama fallback exists; production
   build needs Anthropic API key set (or document a
   self-host-with-Ollama path).
6. Cut v1.0 release tag.

Estimated operator time: **~1-2 hours** if Supabase + Vercel are
already provisioned (operator has done the heavy lifting; DEPLOY.md
is the punch list).

---

## Portfolio operating system instructions

| Aspect | Posture |
|---|---|
| Portfolio status | `Release Frozen (static-host + Supabase backend)` |
| Distribution shape | **Vercel SSR/RSC** (Next.js 15) **+ Supabase backend** |
| Review cadence | Suspend overdue counting |
| Resurface conditions | (a) Supabase production posture audited, (b) Playwright-against-production green, (c) operator opens v1.1 scope packet, or (d) operational signal from live deploy |
| Co-batch with | Static-host cluster: PomGambler (PWA) / HowMoneyMoves (static SPA) / **Premise (SSR+Supabase)** — **now 3 repos in 3 sub-shapes** |
| Special concern | **Supabase RLS policies.** Hostile vote-injection / argument-injection is the most likely abuse vector; RLS must cover row-level write paths. |
| Special concern | **Rate limiting at scale.** In-memory rate limiting works for single-instance Vercel deploys; distributed/edge needs Redis-backed limits. |
| Special concern | **AI classifier cost.** Anthropic API for argument classification could run up costs on high-traffic days; the Ollama fallback (`7f9198b`) is the operator-runs-locally escape valve, but the public deploy needs cost controls. |

---

## Why this row expands the static-host cluster taxonomy

The static-host cluster wasn't initially defined to distinguish
sub-shapes — PomGambler founded it with the PWA shape, HowMoneyMoves
joined with the static SPA shape. Premise introduces:

- **SSR / RSC** — Next.js App Router server-side rendering, not
  static-only
- **Database backend** — Supabase, with auth and realtime, not just
  a CDN-served frontend
- **Rate-limited API routes** — production security hardening that
  pure static apps don't need

Future Vercel-hosted Next.js + database repos should batch as a
"Vercel + Supabase" sub-shape with Premise as the precedent. Repos
that are PWA or pure static should batch with the existing
sub-shapes.

---

## Reactivation procedure (for the next code session)

1. Verify `git branch -vv` shows `main` tracking `origin/main`.
   Already correct as of this disposition pass.
2. Review the local stash (`r11-premise-stash`) — contains mods to
   `CLAUDE.md` plus untracked `.claude/`, `.codex/`, `.serena/`,
   `AGENTS.md`.
3. **Re-read `DEPLOY.md`** — operator's own runbook is the
   authoritative path to production.
4. Run `pnpm install && pnpm dev` to confirm local toolchain.
5. Run `pnpm test:e2e` or equivalent — Playwright E2E targets
   deployed Vercel URL by default.
6. **Confirm Supabase production project is set up before announce.**

---

## Last known reference

| Field | Value |
|---|---|
| `origin/main` tip | `baada88` fix: forward CSP nonce to RSC scripts for proper hydration |
| Last substantive commit | `5dc2b61` fix: upgrade Next.js 15.5.14 → 15.5.15 to patch GHSA-q4gf-8mx6-v5v3 |
| Default branch | `main` |
| Build system | **Next.js 15** (App Router + RSC) **+ Supabase** + **D3** + TypeScript + Tailwind + Playwright + pnpm |
| Phases shipped | 0-4 per memory; production-hardening cadence visible on canonical main |
| Deploy config | **`DEPLOY.md`** (operator-shipped Vercel + Supabase runbook) + `SETUP.md` |
| Test posture | **Playwright E2E targeting deployed Vercel URL** — production canary-style smoke tests |
| Security posture | CSP middleware + HTTP security headers + rate limiting + RSC nonce forwarding + GHSA-patched Next.js + pnpm-pinned for Vercel reproducibility |
| AI integration | Anthropic API for argument classifier with Ollama fallback (`7f9198b`) |
| Migration state | **No `legacy-origin` remote** — clean |
| Distinguishing feature | **Third static-host cluster member, third sub-shape.** Vercel + Supabase + Next.js 15 SSR/RSC distinct from PWA (PomGambler) and pure static SPA (HowMoneyMoves). |
