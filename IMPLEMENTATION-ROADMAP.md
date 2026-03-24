# Premise — Implementation Roadmap

## Architecture

### System Overview

```
Browser Client
├── Next.js App Router (React 18, TypeScript)
│   ├── /app/(public)/          — Landing, debate discovery feed, read-only debate view
│   ├── /app/(debate)/          — Active debate room with live D3 tree
│   └── /app/(auth)/            — Sign-in, auth callback, username setup
│
├── D3.js Tree Visualization    — d3.tree() layout, zoom/pan, animated transitions
├── Supabase JS Client          — REST queries + Realtime subscriptions (anon key only)
└── Cookie-based anon identity  — UUID in httpOnly cookie (30-day), localStorage mirror

Next.js API Routes (/app/api/)
├── /api/debates/               — Create debate, fetch debate + argument tree
├── /api/arguments/             — Post argument (validate type, parent, char limit)
├── /api/votes/                 — Cast vote (one per user per node, non-participant only)
├── /api/classify-argument/     — Claude Haiku type classifier (optional, graceful degrade)
├── /api/auth/anon-id/          — Set/read httpOnly anon UUID cookie
├── /api/flags/                 — Report an argument node
└── /api/health-check/          — Validates Supabase schema for self-hosters

Supabase (BYOS — bring your own Supabase project)
├── PostgreSQL                  — debates, participants, arguments, votes, users, flags, invitations
├── Row Level Security          — Enforces read/write access at database level
├── Realtime                    — Publishes argument INSERT + vote INSERT to subscribers
└── Auth (optional)             — Magic link email + GitHub OAuth
```

---

## File Structure

```
premise/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                    # Landing page + public debate discovery feed
│   │   └── debate/[id]/page.tsx        # Server-rendered read-only debate view + OG tags
│   ├── (debate)/
│   │   ├── d/[id]/page.tsx             # Active debate room (auth or anon participant)
│   │   └── d/[id]/layout.tsx           # Loads debate metadata, sets up Realtime subscription
│   ├── (auth)/
│   │   ├── sign-in/page.tsx            # Magic link email + GitHub OAuth button
│   │   └── callback/route.ts           # Supabase auth callback + anon-to-auth migration
│   └── api/
│       ├── debates/
│       │   ├── route.ts                # POST — create debate
│       │   └── [id]/route.ts           # GET — fetch debate + full argument tree
│       ├── arguments/
│       │   └── route.ts                # POST — post argument (validated)
│       ├── votes/
│       │   └── route.ts                # POST — cast vote
│       ├── classify-argument/
│       │   └── route.ts                # POST — Claude Haiku type suggestion
│       ├── flags/
│       │   └── route.ts                # POST — flag an argument
│       ├── auth/
│       │   └── anon-id/route.ts        # GET/POST — httpOnly anon UUID cookie
│       └── health-check/
│           └── route.ts                # GET — schema validation for self-hosters
├── components/
│   ├── debate/
│   │   ├── ArgumentTree.tsx            # D3 tree root — mounts SVG, manages zoom/pan ref
│   │   ├── ArgumentNode.tsx            # Individual node popup (full text, vote controls)
│   │   ├── ArgumentForm.tsx            # 3-step submission: text → parent → type
│   │   ├── ArgumentTypeSelector.tsx    # 7-card grid for argument type selection
│   │   ├── VotingControls.tsx          # Strong/Weak buttons (disabled for participants)
│   │   ├── DebateHeader.tsx            # Claim text, status badge, participant slots
│   │   └── LiveBadge.tsx               # "● Live" / "↻ Reconnecting" / "○ Paused"
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   └── ui/
│       ├── Modal.tsx
│       ├── Toast.tsx
│       └── Badge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client (anon key only)
│   │   ├── server.ts                   # Server Supabase client (service role — API routes only)
│   │   └── realtime.ts                 # Subscription factory, heartbeat/reconnect logic
│   ├── d3/
│   │   ├── tree-layout.ts              # d3.tree() layout computation from flat argument array
│   │   └── tree-transitions.ts         # Animated node enter/update/exit via d3.transition()
│   ├── classify.ts                     # Claude Haiku API wrapper (returns null if key unset)
│   ├── crux-finder.ts                  # Identifies deepest node with children from both sides
│   └── anon-identity.ts                # Cookie + localStorage UUID helpers
├── types/
│   └── index.ts                        # All shared TypeScript interfaces (see Data Model section)
├── supabase/
│   ├── seed.sql                        # Full schema + RLS in one file — run this for BYOS setup
│   ├── migrations/                     # Individual migration files for incremental changes
│   └── config.toml                     # Local Supabase dev config
├── public/
├── SETUP.md                            # BYOS self-hosting guide (clone → working in <10 min)
├── CLAUDE.md                           # Claude Code context file
├── .env.local.example                  # Template for all required env vars
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Data Model

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (holds both authenticated and anonymous users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    anon_id UUID UNIQUE,
    username TEXT,
    display_name TEXT,
    debates_participated INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_anon_id ON users(anon_id);
CREATE INDEX idx_users_auth_id ON users(auth_id);

-- Debates
CREATE TABLE debates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_text TEXT NOT NULL CHECK (char_length(claim_text) BETWEEN 1 AND 280),
    creator_id UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'concluding', 'concluded', 'stalled')),
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'private')),
    conclusion_proposed_by UUID REFERENCES users(id),
    conclusion_proposed_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_debates_status ON debates(status);
CREATE INDEX idx_debates_visibility ON debates(visibility);
CREATE INDEX idx_debates_last_activity ON debates(last_activity_at DESC);

-- Participants (the two debaters per debate)
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    side TEXT NOT NULL CHECK (side IN ('for', 'against')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(debate_id, user_id),
    UNIQUE(debate_id, side)
);
CREATE INDEX idx_participants_debate ON participants(debate_id);

-- Arguments (tree nodes)
CREATE TABLE arguments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    parent_argument_id UUID REFERENCES arguments(id) ON DELETE CASCADE,
    argument_type TEXT NOT NULL CHECK (argument_type IN (
        'evidence', 'analogy', 'counterexample', 'reductio',
        'authority', 'concession', 'clarification'
    )),
    content_text TEXT NOT NULL CHECK (char_length(content_text) BETWEEN 1 AND 500),
    side TEXT NOT NULL CHECK (side IN ('for', 'against')),
    net_vote_score INTEGER DEFAULT 0,
    flag_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_arguments_debate ON arguments(debate_id);
CREATE INDEX idx_arguments_parent ON arguments(parent_argument_id);
CREATE INDEX idx_arguments_created ON arguments(created_at);

-- Votes (spectators only — one per user per argument)
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    argument_id UUID NOT NULL REFERENCES arguments(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES users(id),
    vote TEXT NOT NULL CHECK (vote IN ('strong', 'weak')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(argument_id, voter_id)
);
CREATE INDEX idx_votes_argument ON votes(argument_id);

-- Invitations (for private debates)
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    invited_side TEXT CHECK (invited_side IN ('for', 'against')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);
CREATE INDEX idx_invitations_token ON invitations(invite_token);

-- Flags (moderation)
CREATE TABLE flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    argument_id UUID NOT NULL REFERENCES arguments(id) ON DELETE CASCADE,
    flagger_id UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL CHECK (reason IN (
        'bad_faith', 'personal_attack', 'off_topic', 'spam', 'other'
    )),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(argument_id, flagger_id)
);

-- RLS: Enable on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

-- Debates: public readable by all
CREATE POLICY "public debates readable" ON debates
    FOR SELECT USING (visibility = 'public');

-- Debates: private readable by participants only
CREATE POLICY "private debates readable by participants" ON debates
    FOR SELECT USING (
        visibility = 'private' AND
        id IN (SELECT debate_id FROM participants WHERE user_id = auth.uid())
    );

-- Arguments: readable if debate is public or user is participant
CREATE POLICY "arguments readable" ON arguments
    FOR SELECT USING (
        debate_id IN (SELECT id FROM debates WHERE visibility = 'public')
        OR debate_id IN (SELECT debate_id FROM participants WHERE user_id = auth.uid())
    );

-- Arguments: participants can post to their own debate
CREATE POLICY "participants can post arguments" ON arguments
    FOR INSERT WITH CHECK (
        author_id = auth.uid() AND
        debate_id IN (SELECT debate_id FROM participants WHERE user_id = auth.uid())
    );

-- Votes: spectators only (not participants in the target debate)
CREATE POLICY "spectators can vote" ON votes
    FOR INSERT WITH CHECK (
        voter_id = auth.uid() AND
        argument_id NOT IN (
            SELECT a.id FROM arguments a
            JOIN participants p ON a.debate_id = p.debate_id
            WHERE p.user_id = auth.uid()
        )
    );

CREATE POLICY "votes readable by all" ON votes FOR SELECT USING (true);
```

---

## TypeScript Interfaces

```typescript
// types/index.ts

export type DebateStatus = 'open' | 'in_progress' | 'concluding' | 'concluded' | 'stalled';
export type DebateSide = 'for' | 'against';
export type ArgumentType =
  | 'evidence'
  | 'analogy'
  | 'counterexample'
  | 'reductio'
  | 'authority'
  | 'concession'
  | 'clarification';
export type VoteValue = 'strong' | 'weak';
export type FlagReason = 'bad_faith' | 'personal_attack' | 'off_topic' | 'spam' | 'other';

export interface User {
  id: string;
  authId: string | null;
  anonId: string | null;
  username: string | null;
  displayName: string | null;
  debatesParticipated: number;
  createdAt: string;
}

export interface Debate {
  id: string;
  claimText: string;
  creatorId: string;
  status: DebateStatus;
  visibility: 'public' | 'private';
  conclusionProposedBy: string | null;
  conclusionProposedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  participants?: Participant[];
  argumentCount?: number;
}

export interface Participant {
  id: string;
  debateId: string;
  userId: string;
  side: DebateSide;
  joinedAt: string;
  user?: User;
}

export interface Argument {
  id: string;
  debateId: string;
  authorId: string;
  parentArgumentId: string | null;
  argumentType: ArgumentType;
  contentText: string;
  side: DebateSide;
  netVoteScore: number;
  flagCount: number;
  createdAt: string;
  // Populated client-side for D3 tree building
  children?: Argument[];
}

export interface Vote {
  id: string;
  argumentId: string;
  voterId: string;
  vote: VoteValue;
  createdAt: string;
}

export interface Flag {
  id: string;
  argumentId: string;
  flaggerId: string;
  reason: FlagReason;
  createdAt: string;
}

// D3 node type — extends Argument with computed layout data
export interface ArgumentTreeNode extends d3.HierarchyPointNode<Argument> {
  data: Argument;
  strokeWidth: number;      // 2 + Math.max(0, netVoteScore) * 0.5, capped at 8
  isHighlighted: boolean;   // true if identified as crux node
  isDisputed: boolean;      // true if flagCount >= 5
}

export interface ClassifyResponse {
  suggestedType: ArgumentType | null;  // null if ANTHROPIC_API_KEY unset
  confidence: number;
  reasoning: string;
}

export interface HealthCheckResult {
  tablesExist: boolean;
  realtimeEnabled: boolean;
  rlsEnabled: boolean;
  missingTables: string[];
  errors: string[];
}

// API request/response shapes
export interface CreateDebateRequest {
  claimText: string;
  visibility: 'public' | 'private';
}

export interface CreateDebateResponse {
  id: string;
  inviteUrl: string;   // /d/[id]?join=against
}

export interface PostArgumentRequest {
  debateId: string;
  parentArgumentId: string | null;
  argumentType: ArgumentType;
  contentText: string;
}

export interface CastVoteRequest {
  argumentId: string;
  vote: VoteValue;
}
```

---

## API Contracts

### Internal Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/debates` | POST | Anon or Auth | Create debate; returns `{ id, inviteUrl }` |
| `/api/debates/[id]` | GET | Public (if public debate) | Fetch debate + full argument tree |
| `/api/arguments` | POST | Participant only | Post argument; validates type, parent, char limit |
| `/api/votes` | POST | Non-participant | Cast vote; enforces one-per-user-per-node |
| `/api/classify-argument` | POST | None | Haiku type suggestion; degrades to null if no key |
| `/api/flags` | POST | Anon or Auth | Flag an argument |
| `/api/auth/anon-id` | GET | None | Get/create httpOnly anon UUID cookie |
| `/api/auth/anon-id` | POST | None | Migrate anon ID to auth ID post sign-in |
| `/api/health-check` | GET | None | Schema validation for self-hosters |

### External APIs

| Service | Usage | Auth | Rate Limit |
|---------|-------|------|------------|
| Anthropic Messages API | Argument type classifier | Bearer `ANTHROPIC_API_KEY` | 1 req/submission, optional |
| Supabase Realtime | Live argument + vote delivery | Supabase anon key | 200 concurrent connections (free tier) |
| Supabase Auth | Magic link + GitHub OAuth | Built-in | N/A |

---

## Dependencies

```bash
# Initialize project
npx create-next-app@14 premise --typescript --tailwind --app --no-src-dir
cd premise

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# D3
npm install d3@7

# Anthropic (optional classifier)
npm install @anthropic-ai/sdk@0.20

# UI / Utilities
npm install framer-motion@11 clsx tailwind-merge

# Dev dependencies
npm install -D @types/d3 @types/node

# Copy env template
cp .env.local.example .env.local
```

**.env.local.example:**
```bash
# Required — get from your Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional — enables AI argument type classifier
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Scope Boundaries

**In scope (v1):**
- Create, join, and participate in structured debates (public and private)
- D3.js argument tree with `d3.tree()` layout, zoom/pan, animated transitions
- Supabase Realtime — live argument and vote delivery to spectators
- Spectator voting (strong/weak per node), branch thickness mapped to net score
- Crux detection — deepest node with children from both sides, gold highlight
- Anonymous participation via httpOnly cookie UUID
- Optional Supabase Auth (email magic link + GitHub OAuth)
- Anonymous-to-auth migration on sign-in
- Public debate discovery feed (landing page)
- Shareable read-only debate URLs with OG meta tags
- Debate conclusion flow (mutual agreement or 24h auto-accept)
- Stale debate auto-close (48h inactivity → "stalled")
- Spectator flagging (5 flags → disputed badge + 50% opacity)
- Optional AI argument type classifier (Claude Haiku, graceful degrade)
- BYOS self-hosting via seed.sql + SETUP.md
- `/api/health-check` for self-hosters to validate their setup

**Out of scope (v1):**
- Spectator comments (votes only)
- Formal logic / semi-formal notation mode
- Debate archives with search
- Embedding debate trees in external sites
- Calibrate integration (prediction accuracy)
- Reputation/scoring system
- Automated moderation (human flagging only in v1)
- Mobile native app

**Deferred to v2:**
- AI argument coach (draft review before posting)
- Embeddable debate tree widget
- Full-text search of debate archives
- Reputation system tied to voting accuracy
- Formal logic mode

---

## Security & Credentials

- `SUPABASE_SERVICE_ROLE_KEY` — server API routes only (`lib/supabase/server.ts`). Never imported in `/app/` components or client-side code.
- `ANTHROPIC_API_KEY` — server API route only (`/api/classify-argument/route.ts`). Never in client bundle.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe to expose; RLS enforces all access control at DB level.
- Anonymous UUIDs set as httpOnly cookies — not accessible to JavaScript, not logged.
- RLS is the primary security gate. Application-layer checks are defense-in-depth only.
- No PII stored beyond Supabase Auth's email (for magic link). Only username + display name in `users` table.
- Private debate content is RLS-gated at DB level — unreachable even if API route has a bug.
- Add ESLint rule: `no-restricted-imports` on `SUPABASE_SERVICE_ROLE_KEY` in client files.

---

## Phase 0: Foundation (Week 1)

**Objective:** Project scaffold with all dependencies installed, full Supabase schema deployed, RLS active, anonymous identity system working, health-check endpoint validating setup.

**Tasks:**

1. Scaffold Next.js 14 project with TypeScript + Tailwind via `create-next-app`. Install all dependencies from the Dependencies section above. **Acceptance:** `npm run dev` starts without errors; http://localhost:3000 returns 200.

2. Create `supabase/seed.sql` with all CREATE TABLE statements, indexes, and RLS policies from the Data Model section (verbatim). **Acceptance:** `psql $DATABASE_URL -f supabase/seed.sql` completes with 0 errors; all 7 tables visible in Supabase Studio.

3. Enable Supabase Realtime on the `arguments` and `votes` tables via Supabase Studio → Database → Replication. Document this manual step in `SETUP.md`. **Acceptance:** Both tables listed as enabled in Supabase Realtime settings.

4. Create `types/index.ts` with all interfaces from the TypeScript Interfaces section (verbatim). **Acceptance:** `npx tsc --noEmit` passes with zero errors.

5. Implement `lib/supabase/client.ts` (browser client, anon key) and `lib/supabase/server.ts` (service role, for API routes only). **Acceptance:** A test API route can insert a row into `users` and read it back using the server client.

6. Implement `app/api/auth/anon-id/route.ts`: GET reads `premise-anon-id` httpOnly cookie; if missing, generates UUID v4, sets httpOnly cookie (30-day expiry, sameSite=lax, secure in prod), inserts row into `users` table with that `anon_id`, returns `{ anonId: string }`. POST accepts `{ authId: string }` and updates the matching `users` row to set `auth_id`. **Acceptance:** GET request sets `premise-anon-id` httpOnly cookie; same UUID returned on subsequent GETs from same browser; cookie absent in `document.cookie` (httpOnly confirmed).

7. Implement `app/api/health-check/route.ts`: queries `information_schema.tables` for all 7 expected tables (`users`, `debates`, `participants`, `arguments`, `votes`, `invitations`, `flags`), checks `rls_enabled` on each, returns `HealthCheckResult` JSON. **Acceptance:** GET /api/health-check returns `{ tablesExist: true, realtimeEnabled: true, rlsEnabled: true, missingTables: [], errors: [] }`.

8. Write `SETUP.md` with exact steps: clone → npm install → create Supabase project → copy .env.local.example → run seed.sql → enable Realtime (manual step, with screenshot guide) → npm run dev → GET /api/health-check to verify. Add troubleshooting section covering: missing env var, Realtime not enabled, RLS blocking reads, GitHub OAuth callback URL mismatch, service role key used on client. **Acceptance:** A fresh macOS machine following it verbatim gets a working local env in under 10 minutes.

**Verification Checklist:**
- [ ] `npm run dev` → localhost:3000 loads, no console errors
- [ ] `psql $DATABASE_URL -f supabase/seed.sql` → "CREATE TABLE" × 7
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `GET /api/auth/anon-id` → `{ anonId: "uuid-v4" }`, cookie set as httpOnly
- [ ] `GET /api/health-check` → `{ tablesExist: true, realtimeEnabled: true, rlsEnabled: true }`
- [ ] `document.cookie` in browser console does NOT contain `premise-anon-id`

**Risks:**
- Supabase Realtime enable is a manual Studio step, not scriptable → Document with screenshots in SETUP.md; health-check explicitly flags if it's missing.

---

## Phase 1: Core Debate Flow (Weeks 2–3)

**Objective:** Create a debate, join as the opposing side, post categorized arguments, and view the argument tree rendered in D3 (static data, no Realtime yet).

**Tasks:**

1. Implement `POST /api/debates/route.ts`: validate claim (1–280 chars), create `debates` row (status=`open`, visibility from request), create `participants` row for creator (side=`for`), return `{ id, inviteUrl: "/d/[id]?join=against" }`. Use service role client. Resolve anon user from `premise-anon-id` cookie. **Acceptance:** POST `{ claimText: "AI replaces white-collar jobs by 2035", visibility: "public" }` → returns `{ id: "uuid", inviteUrl: "/d/uuid?join=against" }`, rows visible in Supabase Studio.

2. Implement `GET /api/debates/[id]/route.ts`: fetch debate row + participants + all arguments for the debate. Build argument tree in JS (recursive: `{ ...arg, children: args.filter(a => a.parentArgumentId === arg.id) }`). Return `{ debate, participants, tree: ArgumentTree }`. **Acceptance:** GET /api/debates/[id] returns full debate object with nested argument tree.

3. Build `app/(public)/page.tsx` landing: hero with "Start a Debate" CTA, 280-char text input for claim (live counter), visibility toggle. On submit, POST /api/debates, redirect to `/d/[id]`. **Acceptance:** Submit a claim → debate created → redirected to `/d/[id]`.

4. Build `app/(debate)/d/[id]/layout.tsx`: server component that fetches debate metadata. Build `app/(debate)/d/[id]/page.tsx`: renders `DebateHeader` (claim, status badge, two participant slots) + left panel (`ArgumentTree`, 70% width) + right panel (`ArgumentForm`, 30% width, hidden if user is not a participant). **Acceptance:** Route loads showing claim text; unmatched participant slot shows "Waiting for opponent."

5. Implement join-debate flow: visiting `/d/[id]?join=against` checks that debate is `open`, `against` slot is empty, and current user is not already a participant; creates `participants` row for current user (anon or auth) with side=`against`; updates debate status to `in_progress`; redirects to `/d/[id]`. **Acceptance:** Two separate browser sessions (use incognito for second) can each join a debate on opposite sides.

6. Build `ArgumentTypeSelector.tsx`: 2-column grid of 7 cards. Each card: type name (bold), one-line description, a concrete example in italics. Types and descriptions:
   - **Evidence** — "An empirical fact, study, or data point." Example: *"A 2023 meta-analysis of 40 studies found…"*
   - **Analogy** — "A comparison to a similar situation." Example: *"This is like arguing that cars should be banned because some drivers speed."*
   - **Counterexample** — "A specific case that contradicts the claim." Example: *"Japan has strict gun laws and one of the lowest homicide rates."*
   - **Reductio** — "Show the opponent's logic leads to an absurd conclusion." Example: *"By that logic, we should also ban knives."*
   - **Authority** — "Cite an expert or institution." Example: *"The WHO recommends…"*
   - **Concession** — "Acknowledge a valid point from the other side." Example: *"You're right that correlation ≠ causation here."*
   - **Clarification** — "Ask for or provide clarification on a specific claim." Example: *"What do you mean by 'most' in this context?"*

   **Acceptance:** All 7 cards render; clicking one selects it (highlighted border); clicking again deselects.

7. Build `ArgumentForm.tsx` — 3-step flow:
   - Step 1: Textarea for argument text. Live char counter (gray < 400, amber 400–480, red 480–500, blocked > 500). "Next →" button disabled below 10 chars.
   - Step 2: Parent selector. If first argument in debate, shows "Responding to the main claim" as the only option (pre-selected). Otherwise shows a collapsed tree list of existing nodes selectable as parent.
   - Step 3: `ArgumentTypeSelector`. "Submit" button calls POST /api/arguments. Shows loading state. On success: toast "Argument posted", form resets to Step 1.

   **Acceptance:** Full 3-step flow works; submitting calls API; >500 char submit blocked by client and API.

8. Implement `POST /api/arguments/route.ts`: validate author is a participant in the debate (via `participants` table), validate `parent_argument_id` belongs to same debate (or null for root), enforce 500-char CHECK, insert row, update `debates.last_activity_at`, return created argument. **Acceptance:** Valid post → 201 with argument row; >500 chars → 400; non-participant posting → 403.

9. Implement `lib/d3/tree-layout.ts`: function `buildTreeLayout(args: Argument[]): ArgumentTreeNode[]`. Takes flat array, builds `d3.hierarchy()` from parent-child relationships, runs `d3.tree().nodeSize([60, 220])` for horizontal LR layout. Returns array of positioned nodes with `strokeWidth = Math.min(8, 2 + Math.max(0, node.data.netVoteScore) * 0.5)`. **Acceptance:** Unit test: given 10 arguments in a chain, output has correct x/y positions, root at x=0.

10. Build `ArgumentTree.tsx`: React component that mounts a `<svg>` using a `useRef`. On mount + on args change: call `buildTreeLayout()`, render nodes as circles (blue=for, orange=against), edges as curved paths (`d3.linkHorizontal()`), argument type badge (small text below node circle). Attach `d3.zoom()` behavior; store transform in `zoomRef`, re-apply after every re-render to preserve position. Click node → opens `ArgumentNode` tooltip. **Acceptance:** 10-node debate renders as readable LR tree; zoom in/out works via scroll; click shows full argument text.

11. Implement `lib/crux-finder.ts`: `findCrux(args: Argument[]): string | null`. Build tree structure, traverse from leaves upward, find deepest node that has at least one `for` child and one `against` child anywhere in its subtree. Return that node's ID (or null if no crux yet). Mark as `isHighlighted: true` in tree layout. Render crux node with a pulsing gold ring (CSS animation: `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`). **Acceptance:** Unit test: tree where for+against both respond to node N → `findCrux` returns N's ID; node N renders with gold ring.

**Verification Checklist:**
- [ ] POST /api/debates → debate row + participant row in Supabase
- [ ] Two incognito sessions join same debate as for/against
- [ ] 3-step ArgumentForm submits → argument row in Supabase, toast shown
- [ ] POST /api/arguments with >500 chars → 400 response
- [ ] POST /api/arguments from non-participant → 403 response
- [ ] D3 tree renders 10-node debate, zoom works
- [ ] Crux node renders with gold ring when conditions met
- [ ] `npx tsc --noEmit` → 0 errors after Phase 1

---

## Phase 2: Real-Time + Voting (Weeks 4–5)

**Objective:** Spectators see new arguments appear on the tree within 1.5s of posting. Spectators vote strong/weak per node. Branch thickness updates live. Connection status badge works.

**Tasks:**

1. Implement `lib/supabase/realtime.ts`: `createDebateChannel(debateId: string, callbacks: { onArgument, onVote })`. Subscribes to Supabase Realtime on `arguments:debate_id=eq.[debateId]` and `votes:debate_id` (via join). Implements heartbeat: every 30s, if no event received, calls `/api/health-check`; if API is up but no Realtime events, force-fetches `/api/debates/[id]` to resync. Returns `{ subscribe, unsubscribe, connectionState }` (connectionState: `'live' | 'reconnecting' | 'paused'`). **Acceptance:** Subscribe to a channel, insert a row directly in Supabase Studio, `onArgument` callback fires within 1.5s.

2. Wire Realtime into `app/(debate)/d/[id]/layout.tsx`: `useEffect` subscribes on mount, unsubscribes on unmount. On `onArgument` event: append new node to local args state; call `buildTreeLayout()` with new args; re-apply `d3.transition().duration(400)` to all node positions. Throttle re-layouts to max 1 per 500ms (debounce). **Acceptance:** Tab A posts argument → Tab B's tree updates within 1.5s with smooth transition; existing nodes shift, don't jump; zoom position preserved.

3. Build `LiveBadge.tsx`: reads `connectionState` from the channel ref. Renders: green "● Live" (live), amber "↻ Reconnecting" (reconnecting), grey "○ Paused" (concluded debate). **Acceptance:** DevTools → Network → Offline → badge switches to "Reconnecting" within 30s; re-enable → "Live" within 5s.

4. Build `VotingControls.tsx`: shown inside `ArgumentNode` tooltip. Two buttons: 👍 Strong / 👎 Weak. Disabled conditions: (a) current user is a debate participant (check via local participant state), (b) current user already voted on this node (track in a `userVotes: Set<string>` in component state, persisted in sessionStorage). On click: optimistic UI update (increment/decrement display score), POST /api/votes, revert on error. **Acceptance:** Spectator votes → score updates instantly (optimistic); participant's buttons show disabled tooltip "Participants can't vote"; voting twice → second vote blocked.

5. Implement `POST /api/votes/route.ts`: validate voter is NOT a participant in the debate; enforce `UNIQUE(argument_id, voter_id)` (Postgres handles this — catch 23505 error and return 409); increment or decrement `arguments.net_vote_score` (strong → +1, weak → -1) via explicit UPDATE; return `{ argumentId, newScore }`. **Acceptance:** Two "strong" votes on argument X → `net_vote_score = 2` in DB; third vote from same user → 409.

6. Wire vote Realtime events: on `onVote` callback, update `netVoteScore` on the matching argument in local state; recompute `strokeWidth` for that node; apply `d3.transition().duration(300)` to update branch thickness. **Acceptance:** Vote in Tab A → Tab B's branch thickness changes within 800ms.

7. Add mobile thread view: below `md` breakpoint (768px), show a "Thread View" toggle button in `DebateHeader`. Thread View renders arguments as a flat list, sorted by `createdAt`, indented by depth (depth × 16px padding-left), with argument type badge and net score shown inline. D3 tree is default on desktop, Thread View is default on mobile. **Acceptance:** 390px viewport: Thread View shows all arguments readable; toggling to D3 tree shows scrollable canvas.

**Verification Checklist:**
- [ ] Two tabs: post in Tab A → Tab B tree updates in <1.5s
- [ ] Zoom in to deep branch → new node added elsewhere → zoom position unchanged
- [ ] Vote "Strong" 3× on same argument → `net_vote_score = 3` in DB; branch 3.5px thick
- [ ] Same user votes twice → 409 from API; UI reverts optimistic update
- [ ] Participant: VotingControls disabled with tooltip
- [ ] DevTools Offline → LiveBadge "Reconnecting" within 30s
- [ ] 390px viewport: Thread View default, toggle works

---

## Phase 3: Auth + Discovery + Shareability (Weeks 6–7)

**Objective:** Email magic link + GitHub OAuth sign-in. Anonymous contributions migrate to auth account. Public debate discovery feed. Shareable URLs with OG tags. Debate conclusion flow.

**Tasks:**

1. Enable Supabase Auth in Supabase dashboard: enable email (magic link), enable GitHub OAuth (register GitHub OAuth app, paste client ID + secret into Supabase Auth settings, set callback URL to `https://[your-domain]/auth/callback`). **Acceptance:** Magic link email arrives within 30s; GitHub OAuth redirects correctly.

2. Build `app/(auth)/sign-in/page.tsx`: email input with "Send Magic Link" button (calls `supabase.auth.signInWithOtp({ email })`); GitHub button (calls `supabase.auth.signInWithOAuth({ provider: 'github' })`). Show success state after magic link sent: "Check your email." **Acceptance:** Entering email → "Check your email" shown; GitHub button redirects to GitHub consent screen.

3. Implement `app/(auth)/callback/route.ts`: exchange auth code for session via `supabase.auth.exchangeCodeForSession(code)`. Read `premise-anon-id` cookie. Call POST /api/auth/anon-id with `{ authId: session.user.id }` to migrate anonymous user row. Redirect to `/`. **Acceptance:** Sign in via magic link → user `auth_id` set on the correct `users` row; prior anonymous arguments still attributed to that user.

4. Build public debate discovery feed on `app/(public)/page.tsx` (below the "Start a Debate" CTA): paginated list of public debates ordered by `last_activity_at DESC`. Each item: claim text (truncated at 120 chars), status badge, argument count, participant count. Cursor-based pagination: load 20 per page, "Load more" button appends next 20. **Acceptance:** 20 public debates visible on landing; "Load more" fetches next page; clicking a debate navigates to `/debate/[id]`.

5. Build `app/(public)/debate/[id]/page.tsx`: server-rendered read-only debate view. Fetches debate + arguments server-side. Renders `ArgumentTree` in read-only mode (no ArgumentForm, VotingControls visible but disabled). Add OG meta tags in `generateMetadata()`: `og:title` = `[claimText] — Premise`, `og:description` = `[X] arguments, [Y] votes — watch the structured debate`. **Acceptance:** Load as logged-out user → tree visible, no argument form; `curl -A 'Twitterbot' https://[domain]/debate/[id]` → correct OG tags in HTML head.

6. Add "Share" button in `DebateHeader`: copies `window.location.origin + '/debate/' + debateId` to clipboard; shows "Copied!" toast for 2s. For private debates: copies the invite link (`/d/[id]?join=against&token=[inviteToken]`). **Acceptance:** Share button works; copied URL opens the public read-only view.

7. Implement debate conclusion flow:
   - Active participant sees "Propose Conclusion" button (only when debate is `in_progress`).
   - Clicking creates a `conclusion_proposed_by` + `conclusion_proposed_at` record on the debate row, sets status to `concluding`.
   - Opponent sees a banner: "Your opponent proposes ending the debate. [Accept] [Decline]"
   - Accept → debate status = `concluded`, no new arguments accepted (API returns 409).
   - Decline → status reverts to `in_progress`, conclusion fields cleared.
   - 24h auto-accept: add a Supabase Edge Function (or pg_cron job) that runs hourly, finds debates with status=`concluding` and `conclusion_proposed_at < NOW() - INTERVAL '24 hours'`, sets status=`concluded`.
   - 48h stale: same Edge Function sets status=`stalled` for debates where `last_activity_at < NOW() - INTERVAL '48 hours'` and status=`in_progress`.
   **Acceptance:** Accept flow → status=`concluded`, ArgumentForm hidden, new argument POST → 409; 48h stale test (manually set `last_activity_at` to past) → status=`stalled`.

8. Build username setup modal: triggered on first authenticated sign-in if `users.username IS NULL`. Input: alphanumeric + underscores, 3–20 chars, unique enforced by Postgres UNIQUE constraint. On submit: PATCH to `/api/users/username`, dismiss modal, toast "Welcome to Premise." **Acceptance:** First sign-in → modal appears; setting username → persisted; refreshing page → modal does not reappear.

**Verification Checklist:**
- [ ] Magic link sign-in → authenticated session, `users.auth_id` populated
- [ ] Post anonymous argument → sign in → argument still shows in same debate
- [ ] Landing shows 20 public debates; "Load more" works
- [ ] `/debate/[id]` accessible logged-out; OG tags present in HTML source
- [ ] Propose conclusion + accept → status=`concluded`, form locked
- [ ] Username modal on first sign-in; doesn't reappear after set

---

## Phase 4: Launch Prep (Week 8)

**Objective:** AI classifier integrated, moderation flagging live, BYOS docs finalized, Vercel production deploy complete, landing page polished.

**Tasks:**

1. Implement `app/api/classify-argument/route.ts`: POST `{ contentText: string }`. If `ANTHROPIC_API_KEY` not set, return `{ suggestedType: null, confidence: 0, reasoning: "" }` immediately. Otherwise call Claude Haiku with this system prompt: *"You are an argument classifier. Given an argument text, identify which of these 7 types it is: evidence, analogy, counterexample, reductio, authority, concession, clarification. Definitions: evidence=empirical fact/data; analogy=comparison to similar situation; counterexample=specific case contradicting a claim; reductio=showing opponent's logic leads to absurdity; authority=citing an expert/institution; concession=acknowledging opponent's valid point; clarification=asking for or providing definition. Return ONLY valid JSON: { suggestedType: string, confidence: number, reasoning: string }."* Parse JSON, validate `suggestedType` is a valid `ArgumentType`, return `ClassifyResponse`. **Acceptance:** POST "Studies show countries with strict gun laws have lower homicide rates" → `{ suggestedType: "evidence", confidence: > 0.8 }`; no `ANTHROPIC_API_KEY` → `{ suggestedType: null }`.

2. Wire classifier into `ArgumentForm.tsx` Step 1: after user pauses typing for 1000ms (debounced) and text ≥ 50 chars, call `/api/classify-argument`. In Step 3, pre-select the suggested type card with an "AI suggested ✦" label. User can select any other card to override (clears the AI label). If classifier returns null, Step 3 shows no pre-selection. **Acceptance:** Type 50+ chars → after 1s pause, suggested type pre-selected in Step 3; selecting a different type removes the label; form works identically with no API key.

3. Implement flagging: add flag icon (⚑) to each `ArgumentNode` tooltip. Clicking opens a small popover with a reason dropdown (5 options from `FlagReason` type) + "Submit Flag" button. POST `/api/flags/route.ts`: validates flagger is not the argument's author, enforces `UNIQUE(argument_id, flagger_id)`, increments `arguments.flag_count`, returns updated count. In `ArgumentTree.tsx`: nodes with `flagCount >= 5` render with 50% opacity and a "Disputed" badge. **Acceptance:** Flag an argument → `flag_count` increments in DB; 5 flags from distinct users → disputed badge + opacity change.

4. Deploy to Vercel: set all production env vars in Vercel dashboard (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optionally `ANTHROPIC_API_KEY`). Set `NEXTAUTH_URL` (if using any custom auth middleware). Connect GitHub repo for auto-deploy on `main`. **Acceptance:** `https://[your-domain]/api/health-check` returns `{ tablesExist: true, realtimeEnabled: true, rlsEnabled: true }`.

5. Polish landing page: add animated mini debate tree above the fold using CSS only (3 nodes, SVG, no D3). "How It Works" section: 3 steps ("1. Start with a claim", "2. Structure your arguments", "3. Watch the tree grow"). "Self-Host in 10 Minutes" section with the clone + health-check commands as a code block. Link to GitHub. **Acceptance:** Lighthouse performance ≥ 85 on desktop; page renders in <2s on Vercel.

6. Final SETUP.md review: test the guide cold on a fresh Supabase project. Time the setup. Fix any ambiguous steps. Add the 5 most common self-host failure modes to the troubleshooting section: missing env var, Realtime not enabled, RLS blocking reads, GitHub OAuth callback URL mismatch, service role key used on client. **Acceptance:** Saagar can follow it and get to a passing health-check in under 10 minutes.

**Verification Checklist:**
- [ ] POST /api/classify-argument → valid `ArgumentType` suggestion
- [ ] No `ANTHROPIC_API_KEY` → returns null gracefully, ArgumentForm works
- [ ] 5 flags on one argument → disputed badge + 50% opacity in tree
- [ ] Vercel deploy → health-check passes on production URL
- [ ] Lighthouse ≥ 85 on landing page
- [ ] SETUP.md cold run under 10 minutes

---

## Argument Type Reference

For use in prompts, UI copy, and classifier training:

| Type | Description | Example |
|------|-------------|---------|
| `evidence` | Empirical fact, study, or data point | "A 2023 meta-analysis of 40 studies found…" |
| `analogy` | Comparison to a similar situation | "This is like arguing cars should be banned because some drivers speed." |
| `counterexample` | Specific case that contradicts the claim | "Japan has strict gun laws and one of the lowest homicide rates." |
| `reductio` | Showing opponent's logic leads to absurdity | "By that logic, we should also ban knives." |
| `authority` | Citing an expert or institution | "The WHO recommends…" |
| `concession` | Acknowledging a valid point from the other side | "You're right that correlation ≠ causation here." |
| `clarification` | Asking for or providing definition | "What do you mean by 'most' in this context?" |

## D3 Branch Thickness Formula

```typescript
// strokeWidth: 2px base, +0.5px per net vote, capped at 8px
const strokeWidth = Math.min(8, 2 + Math.max(0, netVoteScore) * 0.5);

// Node opacity for disputed arguments
const opacity = flagCount >= 5 ? 0.5 : 1.0;

// Crux node: pulsing gold ring (CSS animation applied as a class)
const isCrux = findCrux(args) === argument.id;
```
