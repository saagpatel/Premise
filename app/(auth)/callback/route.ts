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

	// Fire-and-forget: link anon identity to authenticated user
	const cookieStore = await cookies();
	const anonCookie = cookieStore.get("premise-anon-id");

	if (anonCookie?.value) {
		const appBaseUrl =
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

		fetch(`${appBaseUrl}/api/auth/anon-id`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ authId: session.user.id }),
		}).catch((err: unknown) => {
			console.error("[callback] Failed to link anon identity:", err);
		});
	}

	// Check if user has a username set
	const serviceClient = createServiceRoleClient();
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
