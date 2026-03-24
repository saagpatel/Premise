import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
	const anonId = getAnonId();
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

	let body: { argumentId?: unknown; vote?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	// Validate argumentId
	if (typeof body.argumentId !== "string" || !body.argumentId) {
		return NextResponse.json(
			{ error: "argumentId is required" },
			{ status: 400 },
		);
	}
	const argumentId = body.argumentId;

	// Validate vote
	if (body.vote !== "strong" && body.vote !== "weak") {
		return NextResponse.json(
			{ error: 'vote must be "strong" or "weak"' },
			{ status: 400 },
		);
	}
	const vote = body.vote;

	try {
		// Fetch the argument to get its debate_id
		const { data: argument, error: argumentError } = await supabase
			.from("arguments")
			.select("id, debate_id, net_vote_score")
			.eq("id", argumentId)
			.single();

		if (argumentError || !argument) {
			return NextResponse.json(
				{ error: "Argument not found" },
				{ status: 404 },
			);
		}

		// Check user is NOT a participant in this debate
		const { data: participant } = await supabase
			.from("participants")
			.select("id")
			.eq("debate_id", argument.debate_id)
			.eq("user_id", userId)
			.single();

		if (participant) {
			return NextResponse.json(
				{ error: "Participants cannot vote" },
				{ status: 403 },
			);
		}

		// Insert vote
		const { error: insertError } = await supabase.from("votes").insert({
			argument_id: argumentId,
			voter_id: userId,
			vote,
		});

		if (insertError) {
			if (insertError.code === "23505") {
				return NextResponse.json(
					{ error: "Already voted on this argument" },
					{ status: 409 },
				);
			}
			console.error("Failed to insert vote:", insertError.message);
			return NextResponse.json(
				{ error: "Failed to cast vote" },
				{ status: 500 },
			);
		}

		// Update net_vote_score: fetch-then-update (no atomic RPC available)
		const delta = vote === "strong" ? 1 : -1;
		const newScore = (argument.net_vote_score as number) + delta;

		const { error: updateError } = await supabase
			.from("arguments")
			.update({ net_vote_score: newScore })
			.eq("id", argumentId);

		if (updateError) {
			console.error("Failed to update net_vote_score:", updateError.message);
			return NextResponse.json(
				{ error: "Vote recorded but score update failed" },
				{ status: 500 },
			);
		}

		return NextResponse.json({ argumentId, newScore }, { status: 201 });
	} catch (err) {
		console.error("Unexpected error casting vote:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
