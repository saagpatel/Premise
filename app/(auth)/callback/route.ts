import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
	createServerSupabaseClient,
	createServiceRoleClient,
} from "@/lib/supabase/server";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get("code");

	if (!code) {
		return NextResponse.redirect(new URL("/sign-in?error=no_code", origin));
	}

	const supabase = await createServerSupabaseClient();
	const { data, error } = await supabase.auth.exchangeCodeForSession(code);

	if (error || !data.session) {
		return NextResponse.redirect(new URL("/sign-in?error=auth_failed", origin));
	}

	const session = data.session;

	const serviceClient = createServiceRoleClient();

	// Link the anonymous identity to the authenticated user.
	//
	// This used to POST to /api/auth/anon-id over HTTP. That route identifies the
	// anonymous user from the `premise-anon-id` cookie on the incoming request,
	// and a server-to-server fetch sends no cookies, so the call always came back
	// 400 "No anonymous identity cookie found" — and because it was
	// fire-and-forget the failure only ever reached the server log. Every
	// anonymous user who signed in silently lost their history.
	//
	// The cookie is readable right here, and the service client can do the same
	// update directly, so the HTTP hop is removed rather than repaired.
	const cookieStore = await cookies();
	const anonCookie = cookieStore.get("premise-anon-id");

	if (anonCookie?.value) {
		const { error: linkError } = await serviceClient
			.from("users")
			.update({ auth_id: session.user.id })
			.eq("anon_id", anonCookie.value);

		if (linkError) {
			// Non-fatal: the user is authenticated either way, they just keep a
			// separate anonymous row. Surfaced so it is diagnosable.
			console.error(
				"[callback] Failed to link anon identity:",
				linkError.message,
			);
		}
	}

	// Check if user has a username set
	const { data: userRow } = await serviceClient
		.from("users")
		.select("id, username")
		.eq("auth_id", session.user.id)
		.limit(1)
		.single();

	if (!userRow || userRow.username === null) {
		return NextResponse.redirect(new URL("/?setup=username", origin));
	}

	return NextResponse.redirect(new URL("/", origin));
}
