![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript) ![Supabase](https://img.shields.io/badge/Supabase-realtime-3ECF8E?logo=supabase) ![D3](https://img.shields.io/badge/D3-7-orange?logo=d3.js) ![Framer Motion](https://img.shields.io/badge/Framer_Motion-11-pink?logo=framer) ![License](https://img.shields.io/badge/license-MIT-green)

# Premise

Open-source structured debate platform — argument trees, live voting, and D3 visualization.

Premise lets two participants argue a claim as a branching tree of structured arguments. Each argument is typed (evidence, analogy, reductio, authority, etc.), can reply to any prior argument on either side, and receives weighted votes. A crux-detection algorithm identifies the deepest node where both sides converge, highlighting it in the live D3 visualization. Debates update in real time over Supabase Realtime, with no account required — anonymous participation is supported via a cookie-based identity.

## What it does

- **Structured argument trees** — replies nest under parent arguments; each node carries a type (`evidence`, `analogy`, `counterexample`, `reductio`, `authority`, `concession`, `clarification`) and a for/against side.
- **Live D3 tree visualization** — the argument graph renders as an interactive tree; crux nodes and disputed arguments are highlighted; node stroke weight scales with vote score.
- **Weighted voting** — cast `strong` or `weak` votes on any argument; net vote scores update in real time via Supabase Realtime.
- **Anonymous participation** — no account required; identity is persisted via a browser cookie. Authenticated accounts are also supported.
- **AI argument classifier** — when an Anthropic API key is configured, an optional classifier suggests the argument type as you write.
- **Invite links** — debate creators can share a join link that pre-assigns the invited participant to the opposing side.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, Server Components) |
| Language | TypeScript 5.9 |
| Database + Auth | Supabase (Postgres + Realtime + RLS) |
| Visualization | D3 v7 |
| Animation | Framer Motion 11 |
| Styling | Tailwind CSS 3 |
| AI (optional) | Anthropic Claude (`@anthropic-ai/sdk`) |
| Testing | Vitest |

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An Anthropic API key (optional — only needed for the AI argument-type classifier)

## Getting started

```bash
# 1. Clone and install
git clone https://github.com/your-org/premise.git
cd premise
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY from your Supabase project settings.
# Optionally add ANTHROPIC_API_KEY to enable the AI classifier.

# 3. Seed the database
# Run lib/supabase/seed.sql against your Supabase project
# (paste into the Supabase SQL editor or use the CLI)

# 4. Start the dev server
npm run dev
# Open http://localhost:3000
```

Other scripts:

```bash
npm run build        # Production build
npm run type-check   # TypeScript check (no emit)
npm run lint         # ESLint
npx vitest           # Run tests
```

## Project structure

```
premise/
├── app/
│   ├── (auth)/          # Sign-in, OAuth callback routes
│   ├── (debate)/        # Debate view and argument routes
│   ├── (public)/        # Public browsing routes
│   └── api/             # Route handlers (arguments, debates, votes, users)
├── components/
│   ├── debate/          # ArgumentTree, ArgumentNode, VotingControls, etc.
│   └── ui/              # Generic UI primitives (Toast)
├── lib/
│   ├── d3/              # Tree layout utilities
│   ├── supabase/        # Supabase client helpers and seed SQL
│   ├── crux-finder.ts   # Crux detection algorithm
│   └── anon-identity.ts # Cookie-based anonymous identity
├── types/               # Shared TypeScript types (Debate, Argument, Vote, etc.)
├── supabase/            # Supabase migrations / config
└── .env.example
```

<!-- TODO: Add screenshot -->

## License

MIT
