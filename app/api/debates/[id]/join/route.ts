import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
	request: Request,
	{ params }: { params: { id: string } },
) {
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

	let body: { side?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const side = body.side;
	if (side !== "for" && side !== "against") {
		return NextResponse.json(
			{ error: "side must be 'for' or 'against'" },
			{ status: 400 },
		);
	}

	const debateId = params.id;

	try {
		// Fetch debate
		const { data: debate, error: debateError } = await supabase
			.from("debates")
			.select("id, status")
			.eq("id", debateId)
			.single();

		if (debateError || !debate) {
			return NextResponse.json({ error: "Debate not found" }, { status: 404 });
		}

		if (debate.status !== "open") {
			return NextResponse.json(
				{ error: "Debate is not open for joining" },
				{ status: 409 },
			);
		}

		// Check if user already joined
		const { data: existing } = await supabase
			.from("participants")
			.select("id")
			.eq("debate_id", debateId)
			.eq("user_id", userId)
			.single();

		if (existing) {
			return NextResponse.json(
				{ error: "You are already a participant" },
				{ status: 409 },
			);
		}

		// Check if slot is taken
		const { data: slotHolder } = await supabase
			.from("participants")
			.select("id")
			.eq("debate_id", debateId)
			.eq("side", side)
			.single();

		if (slotHolder) {
			return NextResponse.json(
				{ error: `The ${side} side is already taken` },
				{ status: 409 },
			);
		}

		// Join
		const { error: joinError } = await supabase.from("participants").insert({
			debate_id: debateId,
			user_id: userId,
			side,
		});

		if (joinError) {
			console.error("Failed to join debate:", joinError.message);
			return NextResponse.json(
				{ error: "Failed to join debate" },
				{ status: 500 },
			);
		}

		// Update status to in_progress
		await supabase
			.from("debates")
			.update({ status: "in_progress" })
			.eq("id", debateId);

		return NextResponse.json({ success: true }, { status: 200 });
	} catch (err) {
		console.error("Unexpected error joining debate:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
