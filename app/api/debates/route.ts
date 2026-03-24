import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CreateDebateResponse } from "@/types";

const VALID_VISIBILITY = ["public", "private"] as const;

export async function POST(request: Request) {
	const anonId = getAnonId();
	if (!anonId) {
		return NextResponse.json(
			{
				error: "Anonymous identity required. Call GET /api/auth/anon-id first.",
			},
			{ status: 401 },
		);
	}

	const supabase = createServiceRoleClient();
	const userId = await resolveUserId(supabase);
	if (!userId) {
		return NextResponse.json(
			{ error: "User not found for anonymous identity" },
			{ status: 401 },
		);
	}

	let body: { claimText?: unknown; visibility?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	// Validate claimText
	if (typeof body.claimText !== "string") {
		return NextResponse.json(
			{ error: "claimText must be a string" },
			{ status: 400 },
		);
	}
	const claimText = body.claimText.trim();
	if (claimText.length < 1 || claimText.length > 280) {
		return NextResponse.json(
			{ error: "claimText must be between 1 and 280 characters" },
			{ status: 400 },
		);
	}

	// Validate visibility
	if (
		!VALID_VISIBILITY.includes(
			body.visibility as (typeof VALID_VISIBILITY)[number],
		)
	) {
		return NextResponse.json(
			{ error: "visibility must be 'public' or 'private'" },
			{ status: 400 },
		);
	}
	const visibility = body.visibility as "public" | "private";

	try {
		// Create debate
		const { data: debate, error: debateError } = await supabase
			.from("debates")
			.insert({
				claim_text: claimText,
				creator_id: userId,
				status: "open",
				visibility,
			})
			.select("id")
			.single();

		if (debateError || !debate) {
			console.error("Failed to create debate:", debateError?.message);
			return NextResponse.json(
				{ error: "Failed to create debate" },
				{ status: 500 },
			);
		}

		// Add creator as "for" participant
		const { error: participantError } = await supabase
			.from("participants")
			.insert({
				debate_id: debate.id,
				user_id: userId,
				side: "for",
			});

		if (participantError) {
			console.error("Failed to add participant:", participantError.message);
			// Clean up the debate
			await supabase.from("debates").delete().eq("id", debate.id);
			return NextResponse.json(
				{ error: "Failed to create debate" },
				{ status: 500 },
			);
		}

		const response: CreateDebateResponse = {
			id: debate.id,
			inviteUrl: `/d/${debate.id}?join=against`,
		};

		return NextResponse.json(response, { status: 201 });
	} catch (err) {
		console.error("Unexpected error creating debate:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
