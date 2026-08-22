import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const COOKIE_NAME = "premise-anon-id";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/**
 * GET /api/auth/anon-id
 * Returns the current anonymous user ID from the httpOnly cookie.
 * If no cookie exists, generates a new UUID, creates a users row, and sets the cookie.
 */
export async function GET() {
	const cookieStore = await cookies();
	const existing = cookieStore.get(COOKIE_NAME);

	if (existing?.value) {
		return NextResponse.json({ anonId: existing.value });
	}

	// Generate new anonymous identity
	const anonId = crypto.randomUUID();
	const supabase = createServiceRoleClient();

	const { error } = await supabase.from("users").insert({ anon_id: anonId });

	if (error) {
		console.error("Failed to create anonymous user:", error.message);
		return NextResponse.json(
			{ error: "Failed to create anonymous identity" },
			{ status: 500 },
		);
	}

	const response = NextResponse.json({ anonId });
	response.cookies.set(COOKIE_NAME, anonId, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: THIRTY_DAYS_SECONDS,
		path: "/",
	});

	return response;
}

// The POST handler that used to live here linked an anonymous identity to an
// authenticated user, taking the target auth id straight from the request body.
// It trusted the caller completely: anyone holding any anonymous cookie could
// POST another person's auth uid and attach their own anonymous row to that
// account, which is an account-linking abuse path with no authentication behind
// it. It also had no legitimate caller left — the only one was the auth
// callback, which linked over HTTP without forwarding the cookie this route
// reads, so it always failed with 400.
//
// Linking now happens in app/(auth)/callback/route.ts, where the auth id comes
// from an exchanged Supabase session rather than from user input, and the
// anonymous cookie is read directly. There is no route that accepts an auth id
// from a client, and there should not be one.
