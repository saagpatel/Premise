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

-- ── Row Level Security ───────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

-- Users: public profile data readable by all
CREATE POLICY "users public profile readable" ON users
    FOR SELECT USING (true);

-- Debates: public readable by all
CREATE POLICY "public debates readable" ON debates
    FOR SELECT USING (visibility = 'public');

-- Debates: private readable by participants only
CREATE POLICY "private debates readable by participants" ON debates
    FOR SELECT USING (
        visibility = 'private' AND
        id IN (SELECT debate_id FROM participants WHERE user_id = auth.uid())
    );

-- Participants: readable if debate is public or user is a participant
CREATE POLICY "participants readable" ON participants
    FOR SELECT USING (
        debate_id IN (SELECT id FROM debates WHERE visibility = 'public')
        OR user_id = auth.uid()
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

-- Votes: readable by all
CREATE POLICY "votes readable by all" ON votes FOR SELECT USING (true);

-- Flags: readable by all (for flag count display)
CREATE POLICY "flags readable by all" ON flags FOR SELECT USING (true);
