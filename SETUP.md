# Premise — Self-Hosting Setup

Get Premise running locally in under 10 minutes.

> Estimated setup time: 5-10 minutes

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A [Supabase](https://supabase.com) project (free tier works)
- `psql` CLI (included with PostgreSQL, or install via `brew install libpq`)

## 1. Clone & Install

```bash
git clone https://github.com/your-org/premise.git
cd premise
pnpm install
```

## 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase project credentials (found in **Supabase Studio → Settings → API**):

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` key (keep secret!) |
| `ANTHROPIC_API_KEY` | Optional — enables AI argument type classifier |

**AI classifier note:** `ANTHROPIC_API_KEY` is optional. If set, the classifier suggests argument categories (evidence, analogy, counterexample, etc.) as users type. Without it, the classifier degrades gracefully and users select types manually — all other functionality is unaffected.

## 3. Run Database Schema

```bash
psql $DATABASE_URL -f supabase/seed.sql
```

Your `DATABASE_URL` is in **Supabase Studio → Settings → Database → Connection string → URI**.

This creates 7 tables (`users`, `debates`, `participants`, `arguments`, `votes`, `invitations`, `flags`) with indexes and Row Level Security policies.

## 4. Enable Realtime

This step must be done manually in Supabase Studio:

1. Go to **Database → Replication**
2. Find the `supabase_realtime` publication
3. Enable replication for the `arguments` table
4. Enable replication for the `votes` table

These tables need Realtime so spectators see new arguments and votes appear live.

## 5. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## 6. Verify Setup

```bash
curl http://localhost:3000/api/health-check | jq
```

Expected output:

```json
{
  "tablesExist": true,
  "realtimeEnabled": true,
  "rlsEnabled": true,
  "missingTables": [],
  "errors": []
}
```

If any field shows a problem, see Troubleshooting below.

## 7. Verify Full Setup

```bash
# Check health
curl http://localhost:3000/api/health-check | jq

# Test classifier (if ANTHROPIC_API_KEY set)
curl -X POST http://localhost:3000/api/classify-argument \
  -H "Content-Type: application/json" \
  -d '{"contentText": "Studies show countries with strict gun laws have lower homicide rates"}' | jq
```

---

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel dashboard
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (optional)
4. Deploy
5. Verify: `curl https://your-domain.vercel.app/api/health-check | jq`

Note: Update your Supabase Auth callback URL to match your Vercel domain (**Supabase Studio → Auth → URL Configuration → Site URL**).

---

## Troubleshooting

### Missing environment variables

Check that `.env.local` exists and all 3 required variables are set:

```bash
grep -E "NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY" .env.local
```

Verify your Supabase project is running (not paused) and the URL has no trailing slash: `https://your-project-ref.supabase.co`.

### "Missing tables" in health check

You haven't run the schema yet. Run:

```bash
psql $DATABASE_URL -f supabase/seed.sql
```

### Realtime not enabled

Realtime must be enabled manually in Supabase Studio (see Step 4 above). It cannot be done via SQL or the CLI.

### RLS blocking reads you expect to work

Public debates and their arguments are readable without authentication. If you're getting empty results:

- Ensure you created rows with `visibility = 'public'` on the debate
- Private debates require Supabase Auth — the RLS policies use `auth.uid()` which is null for anonymous users
- All write operations go through API routes using the service role key, which bypasses RLS

### "Could not verify RLS status"

The health check queries `pg_tables` which may not be exposed via PostgREST in all Supabase configurations. Verify manually: **Supabase Studio → Database → Tables** — each table should show a lock icon indicating RLS is active.

### GitHub OAuth callback URL mismatch

If using Supabase Auth with GitHub OAuth:

1. Go to **Supabase Studio → Auth → Providers → GitHub**
2. Copy the callback URL shown
3. Set it in your GitHub OAuth App settings under "Authorization callback URL"

### Service role key used on client (security risk!)

The `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS policies. It must **never** be imported in `/app/` page components or `/components/`. It should only be used in `/lib/supabase/server.ts` and consumed by API route handlers in `/app/api/`.

### AI classifier not working

Check that `ANTHROPIC_API_KEY` is set in `.env.local`. The classifier is optional — if the key is missing or invalid, the argument form works normally without AI suggestions. No other functionality is affected.

### Flags not incrementing

Ensure the `increment_flag_count` database function exists. Re-run the seed to create it:

```bash
psql $DATABASE_URL -f supabase/seed.sql
```
