-- Premise — Full Schema
-- Run: psql $DATABASE_URL -f supabase/seed.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────────────

-- Users (holds both authenticated and anonymous users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    anon_id UUID UNIQUE,
    username TEXT,
    display_name TEXT,
    debates_participated INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_anon_id ON users(anon_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- Debates
CREATE TABLE IF NOT EXISTS debates (
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
CREATE INDEX IF NOT EXISTS idx_debates_status ON debates(status);
CREATE INDEX IF NOT EXISTS idx_debates_visibility ON debates(visibility);
CREATE INDEX IF NOT EXISTS idx_debates_last_activity ON debates(last_activity_at DESC);

-- Participants (the two debaters per debate)
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    side TEXT NOT NULL CHECK (side IN ('for', 'against')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(debate_id, user_id),
    UNIQUE(debate_id, side)
);
CREATE INDEX IF NOT EXISTS idx_participants_debate ON participants(debate_id);

-- Arguments (tree nodes)
CREATE TABLE IF NOT EXISTS arguments (
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
CREATE INDEX IF NOT EXISTS idx_arguments_debate ON arguments(debate_id);
CREATE INDEX IF NOT EXISTS idx_arguments_parent ON arguments(parent_argument_id);
CREATE INDEX IF NOT EXISTS idx_arguments_created ON arguments(created_at);

-- Votes (spectators only — one per user per argument)
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    argument_id UUID NOT NULL REFERENCES arguments(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES users(id),
    vote TEXT NOT NULL CHECK (vote IN ('strong', 'weak')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(argument_id, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_argument ON votes(argument_id);

-- Invitations (for private debates)
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    invited_side TEXT CHECK (invited_side IN ('for', 'against')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(invite_token);

-- Flags (moderation)
CREATE TABLE IF NOT EXISTS flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    argument_id UUID NOT NULL REFERENCES arguments(id) ON DELETE CASCADE,
    flagger_id UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL CHECK (reason IN (
        'bad_faith', 'personal_attack', 'off_topic', 'spam', 'other'
    )),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(argument_id, flagger_id)
);

-- ── Table Privileges ─────────────────────────────────────────────────
--
-- Current Supabase databases do NOT hand new tables in `public` to the API
-- roles. The default ACL for tables created by `postgres` grants only
-- TRUNCATE/REFERENCES/TRIGGER to anon, authenticated and service_role — never
-- SELECT or INSERT — so a database seeded from this file alone answers every
-- PostgREST call with "permission denied for table ...". Granting explicitly
-- keeps the schema self-sufficient instead of depending on a project's
-- inherited default privileges.
--
-- This does not widen access: RLS is enabled on every table below, so grants
-- are necessary-but-not-sufficient and each row still has to clear a policy.
-- anon/authenticated therefore get SELECT only — every write in the app goes
-- through an API route using the service role key. Realtime also delivers
-- postgres_changes to a subscriber only if that role can SELECT the table.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- ── Row Level Security ───────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

-- ── Policy helper functions ──────────────────────────────────────────
--
-- These exist to break a policy cycle. Written inline, the policies below read:
--   arguments    -> SELECT ... FROM debates       (fires debates' policies)
--   debates      -> SELECT ... FROM participants  (fires participants' policy)
--   participants -> SELECT ... FROM debates       (back to the start)
-- Postgres detects the loop and aborts with 42P17 "infinite recursion detected
-- in policy for relation debates". Nothing in the app surfaced it, because every
-- application read goes through the service role, which bypasses RLS entirely.
-- Realtime does NOT: realtime.apply_rls() re-evaluates these policies as the
-- subscribing role, so the recursion aborted each change and spectators silently
-- received no live events at all.
--
-- SECURITY DEFINER runs the body as the function owner, and a table owner
-- bypasses RLS, so the inner lookups no longer re-enter the policy system. Each
-- function is STABLE, pinned to an explicit search_path so it cannot be
-- hijacked by a caller-controlled schema, and returns only a boolean the
-- policies already imply — no new information is exposed.

CREATE OR REPLACE FUNCTION public.is_public_debate(target_debate_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM debates
    WHERE id = target_debate_id AND visibility = 'public'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_debate_participant(target_debate_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants
    WHERE debate_id = target_debate_id AND user_id = auth.uid()
  );
$$;

-- True when auth.uid() is a debater in the debate that owns this argument —
-- used to keep participants from voting on their own debate without joining
-- arguments to participants inside a policy.
CREATE OR REPLACE FUNCTION public.is_participant_of_argument(target_argument_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM arguments a
    JOIN participants p ON p.debate_id = a.debate_id
    WHERE a.id = target_argument_id AND p.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_public_debate(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_debate_participant(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_participant_of_argument(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_debate(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_debate_participant(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_participant_of_argument(UUID) TO anon, authenticated, service_role;

-- Policies are dropped before creation so this file stays re-runnable:
-- Postgres has no CREATE POLICY IF NOT EXISTS, and SETUP.md instructs users to
-- re-run the seed (e.g. to restore increment_flag_count). Without the drops the
-- second run aborts on the first policy and never reaches the statements below.

-- Users: public profile data readable by all
DROP POLICY IF EXISTS "users public profile readable" ON users;
CREATE POLICY "users public profile readable" ON users
    FOR SELECT USING (true);

-- Debates: public readable by all
DROP POLICY IF EXISTS "public debates readable" ON debates;
CREATE POLICY "public debates readable" ON debates
    FOR SELECT USING (visibility = 'public');

-- Debates: private readable by participants only
DROP POLICY IF EXISTS "private debates readable by participants" ON debates;
CREATE POLICY "private debates readable by participants" ON debates
    FOR SELECT USING (
        visibility = 'private' AND public.is_debate_participant(id)
    );

-- Participants: readable if debate is public or user is a participant
DROP POLICY IF EXISTS "participants readable" ON participants;
CREATE POLICY "participants readable" ON participants
    FOR SELECT USING (
        public.is_public_debate(debate_id) OR user_id = auth.uid()
    );

-- Arguments: readable if debate is public or user is participant
DROP POLICY IF EXISTS "arguments readable" ON arguments;
CREATE POLICY "arguments readable" ON arguments
    FOR SELECT USING (
        public.is_public_debate(debate_id)
        OR public.is_debate_participant(debate_id)
    );

-- Arguments: participants can post to their own debate
DROP POLICY IF EXISTS "participants can post arguments" ON arguments;
CREATE POLICY "participants can post arguments" ON arguments
    FOR INSERT WITH CHECK (
        author_id = auth.uid() AND public.is_debate_participant(debate_id)
    );

-- Votes: spectators only (not participants in the target debate)
DROP POLICY IF EXISTS "spectators can vote" ON votes;
CREATE POLICY "spectators can vote" ON votes
    FOR INSERT WITH CHECK (
        voter_id = auth.uid()
        AND NOT public.is_participant_of_argument(argument_id)
    );

-- Votes: readable by all
DROP POLICY IF EXISTS "votes readable by all" ON votes;
CREATE POLICY "votes readable by all" ON votes FOR SELECT USING (true);

-- Flags: readable by all (for flag count display)
DROP POLICY IF EXISTS "flags readable by all" ON flags;
CREATE POLICY "flags readable by all" ON flags FOR SELECT USING (true);

-- ── Functions ────────────────────────────────────────────────────────

-- Atomic vote score increment — avoids read-modify-write races.
CREATE OR REPLACE FUNCTION increment_vote_score(arg_id UUID, delta INT)
RETURNS void AS $$
  UPDATE arguments SET net_vote_score = net_vote_score + delta WHERE id = arg_id;
$$ LANGUAGE sql;

-- Atomic flag count increment — avoids read-modify-write races.
CREATE OR REPLACE FUNCTION increment_flag_count(arg_id UUID)
RETURNS INTEGER AS $$
  UPDATE arguments SET flag_count = flag_count + 1 WHERE id = arg_id
  RETURNING flag_count;
$$ LANGUAGE sql;

-- Granted after definition: ON ALL FUNCTIONS only covers functions that already
-- exist when the GRANT runs, so this cannot move up with the table grants.
-- Both are called via supabase.rpc() from API routes on the service role.
GRANT EXECUTE ON FUNCTION increment_vote_score(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION increment_flag_count(UUID) TO service_role;

-- ── Health check support ─────────────────────────────────────────────
--
-- /api/health-check needs three facts that PostgREST does not expose:
-- which tables exist, whether RLS is on, and which tables realtime publishes.
-- Querying information_schema / pg_tables / pg_publication_tables through
-- PostgREST always errors, and the route's fallbacks then reported
-- "realtimeEnabled: false" on a working install while still claiming
-- "rlsEnabled: true" purely because the probe had failed. SETUP.md tells
-- self-hosters to expect all-true with an empty errors array, which the old
-- path could never produce in either direction.
--
-- SECURITY DEFINER so it can read the catalogs, returning only aggregate
-- schema facts about this app's own tables. service_role only — this is a
-- setup diagnostic, not public API surface.

CREATE OR REPLACE FUNCTION public.premise_health()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tables', COALESCE((
      SELECT jsonb_agg(tablename ORDER BY tablename)
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('users','debates','participants','arguments','votes','invitations','flags')
    ), '[]'::jsonb),
    'rls_disabled', COALESCE((
      SELECT jsonb_agg(tablename ORDER BY tablename)
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('users','debates','participants','arguments','votes','invitations','flags')
        AND NOT rowsecurity
    ), '[]'::jsonb),
    'realtime', COALESCE((
      SELECT jsonb_agg(tablename ORDER BY tablename)
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    ), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.premise_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.premise_health() TO service_role;

-- ── Realtime ─────────────────────────────────────────────────────────
--
-- lib/supabase/realtime.ts subscribes to INSERT on `arguments` and on `votes`.
-- Those events are only delivered if both tables belong to the
-- `supabase_realtime` publication, so the membership is part of the schema
-- rather than a manual Studio step — a fresh install otherwise looks healthy
-- while spectators silently never see live updates.
--
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member, so
-- each add is guarded to keep this file re-runnable.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'arguments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.arguments;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'votes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
    END IF;
END
$$;
