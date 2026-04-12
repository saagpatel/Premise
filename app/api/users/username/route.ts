import { NextResponse } from "next/server";

import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
	const anonId = await getAnonId();

	if (!anonId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const serviceClient = createServiceRoleClient();
	const userId = await resolveUserId(serviceClient);

	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (typeof body !== "object" || body === null || !("username" in body)) {
		return NextResponse.json(
			{ error: "Missing required field: username" },
			{ status: 422 },
		);
	}

	const { username } = body as Record<string, unknown>;

	if (typeof username !== "string") {
		return NextResponse.json(
			{ error: "username must be a string" },
			{ status: 422 },
		);
	}

	if (username.length < 3 || username.length > 20) {
		return NextResponse.json(
			{ error: "Username must be between 3 and 20 characters" },
			{ status: 422 },
		);
	}

	if (!/^[a-zA-Z0-9_]+$/.test(username)) {
		return NextResponse.json(
			{
				error: "Username may only contain letters, numbers, and underscores",
			},
			{ status: 422 },
		);
	}

	const { error: dbError } = await serviceClient
		.from("users")
		.update({ username })
		.eq("id", userId);

	if (dbError) {
		// Postgres unique violation
		if (dbError.code === "23505") {
			return NextResponse.json(
				{ error: "Username already taken" },
				{ status: 409 },
			);
		}

		console.error("[PATCH /api/users/username] DB error:", dbError);
		return NextResponse.json(
			{ error: "Failed to update username" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ success: true });
}
