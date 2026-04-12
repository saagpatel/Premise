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

/**
 * POST /api/auth/anon-id
 * Links an anonymous user to an authenticated Supabase Auth user.
 * Body: { authId: string }
 */
export async function POST(request: Request) {
	const cookieStore = await cookies();
	const existing = cookieStore.get(COOKIE_NAME);

	if (!existing?.value) {
		return NextResponse.json(
			{ error: "No anonymous identity cookie found" },
			{ status: 400 },
		);
	}

	let body: { authId?: string };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!body.authId || typeof body.authId !== "string") {
		return NextResponse.json(
			{ error: "Missing or invalid authId" },
			{ status: 422 },
		);
	}

	const supabase = createServiceRoleClient();
	const { error } = await supabase
		.from("users")
		.update({ auth_id: body.authId })
		.eq("anon_id", existing.value);

	if (error) {
		console.error("Failed to link auth identity:", error.message);
		return NextResponse.json(
			{ error: "Failed to link authenticated identity" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ success: true });
}
