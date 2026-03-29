# Premise

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript)](#) [![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#)

> Structured arguments. Live votes. Find the exact point where two sides disagree.

Premise is an open-source structured debate platform. Two participants argue a claim as a branching tree of typed arguments. A crux-detection algorithm identifies the deepest node where both sides converge and highlights it live. No account required — anonymous participation via cookie identity is fully supported.

## Features

- **Typed argument nodes** — `evidence`, `analogy`, `counterexample`, `reductio`, `authority`, `concession`, `clarification`
- **Live D3 tree** — interactive force-directed graph; crux nodes highlighted; stroke weight scales with vote score
- **Weighted voting** — `strong` and `weak` votes update in real time via Supabase Realtime
- **Anonymous participation** — cookie-based identity, no account required; authenticated accounts also supported
- **AI argument classifier** — optional Claude-powered type suggester as you write (requires Anthropic API key)
- **Invite links** — shareable join links that pre-assign the invited participant to the opposing side

## Quick Start

### Prerequisites
- Node.js 18+
- Supabase project (free tier works)
- Anthropic API key (optional, for AI classifier)

### Installation
```bash
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Usage
```bash
npm run dev
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router, Server Components) |
| Language | TypeScript 5.9 |
| Database + Auth | Supabase (Postgres + Realtime + RLS) |
| Visualization | D3 v7 |
| Animation | Framer Motion 11 |
| Styling | Tailwind CSS 3 |

## Architecture

Argument nodes and votes are stored in Supabase Postgres with row-level security. Supabase Realtime pushes vote and new-argument events directly to the D3 visualization without polling. The crux-detection algorithm traverses the tree from both roots, computing weighted vote convergence at each depth level. The AI classifier runs as a Next.js route handler — streamed, so the type suggestion appears as you type.

## License

MIT