-- RLS enforcement checks for the policies in seed.sql.
--
-- Run against a freshly seeded database (it inserts its own fixtures):
--   psql $DATABASE_URL -f supabase/rls-test.sql
-- Exits non-zero if any write that must be refused succeeds.
--
-- Guards the regression these policies were rewritten for: reading `debates`
-- from a policy on `arguments`, which read `participants`, which read `debates`
-- again, aborted with 42P17 "infinite recursion detected in policy". Nothing in
-- the app caught it, because app reads use the service role and bypass RLS —
-- only realtime, which re-evaluates policies as the subscriber, hit the loop.

\set ON_ERROR_STOP on

-- Fixtures: one public debate and one private debate, each with an argument.
INSERT INTO users (id, anon_id) VALUES
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid()),
  ('22222222-2222-2222-2222-222222222222', gen_random_uuid());

INSERT INTO debates (id, claim_text, creator_id, visibility) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PUBLIC CLAIM', '11111111-1111-1111-1111-111111111111', 'public'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PRIVATE CLAIM', '11111111-1111-1111-1111-111111111111', 'private');

INSERT INTO participants (debate_id, user_id, side) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'for'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'for');

INSERT INTO arguments (debate_id, author_id, argument_type, content_text, side) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'evidence', 'PUBLIC ARG', 'for'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'evidence', 'PRIVATE ARG', 'for');

-- Anonymous visitor: no auth.uid().
SET ROLE anon;

SELECT 'anon sees public debate' AS check,
       (count(*) = 1) AS pass
FROM debates WHERE claim_text = 'PUBLIC CLAIM';

SELECT 'anon CANNOT see private debate' AS check,
       (count(*) = 0) AS pass
FROM debates WHERE claim_text = 'PRIVATE CLAIM';

SELECT 'anon sees public argument' AS check,
       (count(*) = 1) AS pass
FROM arguments WHERE content_text = 'PUBLIC ARG';

SELECT 'anon CANNOT see private argument' AS check,
       (count(*) = 0) AS pass
FROM arguments WHERE content_text = 'PRIVATE ARG';

SELECT 'anon sees public participants' AS check,
       (count(*) = 1) AS pass
FROM participants WHERE debate_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT 'anon CANNOT see private participants' AS check,
       (count(*) = 0) AS pass
FROM participants WHERE debate_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

-- anon has no INSERT grant and no INSERT policy: the write must be refused.
DO $$
DECLARE
    refused BOOLEAN := FALSE;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        INSERT INTO arguments (debate_id, author_id, argument_type, content_text, side)
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                '11111111-1111-1111-1111-111111111111',
                'evidence', 'ANON INJECTED', 'for');
    EXCEPTION WHEN insufficient_privilege OR others THEN
        refused := TRUE;
    END;
    RESET ROLE;
    RAISE NOTICE 'anon CANNOT insert an argument | %', refused;
    IF NOT refused THEN
        RAISE EXCEPTION 'SECURITY: anon was able to insert an argument';
    END IF;
END
$$;

-- anon must not be able to read another user's vote-free write path either.
DO $$
DECLARE
    refused BOOLEAN := FALSE;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        UPDATE arguments SET net_vote_score = 9999
        WHERE content_text = 'PUBLIC ARG';
        IF FOUND THEN refused := FALSE; ELSE refused := TRUE; END IF;
    EXCEPTION WHEN insufficient_privilege OR others THEN
        refused := TRUE;
    END;
    RESET ROLE;
    RAISE NOTICE 'anon CANNOT update an argument | %', refused;
    IF NOT refused THEN
        RAISE EXCEPTION 'SECURITY: anon was able to update an argument';
    END IF;
END
$$;

-- No recursion: the query that previously aborted with 42P17 must now succeed.
SET ROLE anon;
SELECT 'no policy recursion on join' AS check, (count(*) >= 0) AS pass
FROM arguments a JOIN debates d ON d.id = a.debate_id;
RESET ROLE;
