# Deploying Premise to Vercel

## Prerequisites

- Vercel account linked to your GitHub
- Supabase project created

## 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase/seed.sql`
3. Enable Realtime on these tables:
   - `debates`
   - `arguments`  
   - `votes`
4. Copy your project URL and keys from Settings → API

## 2. Vercel Setup

1. Import the GitHub repo in Vercel
2. Set Framework Preset to **Next.js**
3. Add environment variables:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (enables AI argument classifier) |

4. Deploy

## 3. Verify

- Create a debate → add arguments → vote → verify Realtime updates
- Check `/api/classify-argument` returns AI classifications (requires ANTHROPIC_API_KEY)
- Verify security headers: `curl -I https://your-domain.vercel.app`

## Notes

- The `ANTHROPIC_API_KEY` is optional — the app works without it but the AI argument classifier will be disabled
- Rate limiting is enforced at 10 requests/minute per IP on `/api/classify-argument`
- CSP nonce is generated per-request via middleware.ts
