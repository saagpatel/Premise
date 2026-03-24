import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const COOKIE_NAME = "premise-anon-id";

/** Read the premise-anon-id cookie value, or null if not set. */
export function getAnonId(): string | null {
	const cookieStore = cookies();
	return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/** Look up the users row for the current anon cookie. Returns the DB user id or null. */
export async function resolveUserId(
	supabase: SupabaseClient,
): Promise<string | null> {
	const anonId = getAnonId();
	if (!anonId) return null;

	const { data } = await supabase
		.from("users")
		.select("id")
		.eq("anon_id", anonId)
		.single();

	return data?.id ?? null;
}
