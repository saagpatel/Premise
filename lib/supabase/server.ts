import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client using the anon key.
 * Respects RLS — use for reading public data in server components and route handlers.
 * In Next.js 14, cookies() is synchronous.
 */
export function createServerSupabaseClient() {
	const cookieStore = cookies();

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!url || !anonKey) {
		throw new Error(
			"Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
		);
	}

	return createServerClient(url, anonKey, {
		cookies: {
			getAll: () => cookieStore.getAll(),
			setAll: (cookiesToSet) => {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// setAll can throw in server components where response is read-only.
					// This is expected — cookie writes only work in route handlers and middleware.
				}
			},
		},
	});
}

/**
 * Service-role Supabase client — bypasses RLS.
 * ONLY use in API route handlers (app/api/), never in components.
 */
export function createServiceRoleClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url || !serviceRoleKey) {
		throw new Error(
			"Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
		);
	}

	return createClient(url, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}
