import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ArgumentType } from "@/types";

const VALID_ARGUMENT_TYPES: ArgumentType[] = [
	"evidence",
	"analogy",
	"counterexample",
	"reductio",
	"authority",
	"concession",
	"clarification",
];

export async function POST(request: Request) {
	const anonId = await getAnonId();
	if (!anonId) {
		return NextResponse.json(
			{ error: "Anonymous identity required" },
			{ status: 401 },
		);
	}

	const supabase = createServiceRoleClient();
	const userId = await resolveUserId(supabase);
	if (!userId) {
		return NextResponse.json({ error: "User not found" }, { status: 401 });
	}

	let body: {
		debateId?: unknown;
		parentArgumentId?: unknown;
		argumentType?: unknown;
		contentText?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	// Validate debateId
	if (typeof body.debateId !== "string" || !body.debateId) {
		return NextResponse.json(
			{ error: "debateId is required" },
			{ status: 400 },
		);
	}

	// Validate contentText
	if (typeof body.contentText !== "string") {
		return NextResponse.json(
			{ error: "contentText must be a string" },
			{ status: 400 },
		);
	}
	const contentText = body.contentText.trim();
	if (contentText.length < 1 || contentText.length > 500) {
		return NextResponse.json(
			{ error: "contentText must be between 1 and 500 characters" },
			{ status: 400 },
		);
	}

	// Validate argumentType
	if (!VALID_ARGUMENT_TYPES.includes(body.argumentType as ArgumentType)) {
		return NextResponse.json(
			{
				error: `argumentType must be one of: ${VALID_ARGUMENT_TYPES.join(", ")}`,
			},
			{ status: 400 },
		);
	}
	const argumentType = body.argumentType as ArgumentType;

	// Validate parentArgumentId
	const parentArgumentId =
		body.parentArgumentId === null || body.parentArgumentId === undefined
			? null
			: body.parentArgumentId;
	if (parentArgumentId !== null && typeof parentArgumentId !== "string") {
		return NextResponse.json(
			{ error: "parentArgumentId must be a string or null" },
			{ status: 400 },
		);
	}

	try {
		// Check user is a participant
		const { data: participant, error: participantError } = await supabase
			.from("participants")
			.select("id, side")
			.eq("debate_id", body.debateId)
			.eq("user_id", userId)
			.single();

		if (participantError || !participant) {
			return NextResponse.json(
				{ error: "You are not a participant in this debate" },
				{ status: 403 },
			);
		}

		// If parentArgumentId specified, verify it belongs to the same debate
		if (parentArgumentId) {
			const { data: parentArg, error: parentError } = await supabase
				.from("arguments")
				.select("id, debate_id")
				.eq("id", parentArgumentId)
				.single();

			if (parentError || !parentArg) {
				return NextResponse.json(
					{ error: "Parent argument not found" },
					{ status: 400 },
				);
			}

			if (parentArg.debate_id !== body.debateId) {
				return NextResponse.json(
					{ error: "Parent argument does not belong to this debate" },
					{ status: 400 },
				);
			}
		}

		// Insert argument
		const { data: argument, error: insertError } = await supabase
			.from("arguments")
			.insert({
				debate_id: body.debateId,
				author_id: userId,
				parent_argument_id: parentArgumentId,
				argument_type: argumentType,
				content_text: contentText,
				side: participant.side,
			})
			.select("*")
			.single();

		if (insertError || !argument) {
			console.error("Failed to insert argument:", insertError?.message);
			return NextResponse.json(
				{ error: "Failed to post argument" },
				{ status: 500 },
			);
		}

		// Update last_activity_at on debate
		await supabase
			.from("debates")
			.update({ last_activity_at: new Date().toISOString() })
			.eq("id", body.debateId);

		return NextResponse.json(
			{
				id: argument.id,
				debateId: argument.debate_id,
				authorId: argument.author_id,
				parentArgumentId: argument.parent_argument_id,
				argumentType: argument.argument_type,
				contentText: argument.content_text,
				side: argument.side,
				netVoteScore: argument.net_vote_score,
				flagCount: argument.flag_count,
				createdAt: argument.created_at,
			},
			{ status: 201 },
		);
	} catch (err) {
		console.error("Unexpected error posting argument:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
