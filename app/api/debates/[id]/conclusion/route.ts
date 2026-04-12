import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/debates/[id]/conclusion
 * Propose a debate conclusion. Caller must be a participant, debate must be in_progress.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const anonId = await getAnonId();
	if (!anonId) {
		return NextResponse.json(
			{ error: "Authentication required" },
			{ status: 401 },
		);
	}

	const supabase = createServiceRoleClient();
	const userId = await resolveUserId(supabase);
	if (!userId) {
		return NextResponse.json({ error: "User not found" }, { status: 401 });
	}

	const { id: debateId } = await params;

	// Fetch debate
	const { data: debate, error: debateError } = await supabase
		.from("debates")
		.select("id, status, conclusion_proposed_by")
		.eq("id", debateId)
		.single();

	if (debateError || !debate) {
		return NextResponse.json({ error: "Debate not found" }, { status: 404 });
	}

	if (debate.status !== "in_progress") {
		return NextResponse.json(
			{ error: "Conclusion can only be proposed when debate is in progress" },
			{ status: 409 },
		);
	}

	// Verify caller is a participant
	const { data: participant } = await supabase
		.from("participants")
		.select("id")
		.eq("debate_id", debateId)
		.eq("user_id", userId)
		.single();

	if (!participant) {
		return NextResponse.json(
			{ error: "Only participants can propose a conclusion" },
			{ status: 403 },
		);
	}

	// Propose conclusion
	const { data: updated, error: updateError } = await supabase
		.from("debates")
		.update({
			status: "concluding",
			conclusion_proposed_by: userId,
			conclusion_proposed_at: new Date().toISOString(),
		})
		.eq("id", debateId)
		.select(
			"id, claim_text, creator_id, status, visibility, conclusion_proposed_by, conclusion_proposed_at, last_activity_at, created_at",
		)
		.single();

	if (updateError || !updated) {
		console.error("Failed to propose conclusion:", updateError?.message);
		return NextResponse.json(
			{ error: "Failed to propose conclusion" },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		debate: {
			id: updated.id,
			claimText: updated.claim_text,
			creatorId: updated.creator_id,
			status: updated.status,
			visibility: updated.visibility,
			conclusionProposedBy: updated.conclusion_proposed_by,
			conclusionProposedAt: updated.conclusion_proposed_at,
			lastActivityAt: updated.last_activity_at,
			createdAt: updated.created_at,
		},
	});
}

/**
 * PATCH /api/debates/[id]/conclusion
 * Accept or decline a proposed conclusion.
 * Body: { action: "accept" | "decline" }
 */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const anonId = await getAnonId();
	if (!anonId) {
		return NextResponse.json(
			{ error: "Authentication required" },
			{ status: 401 },
		);
	}

	const supabase = createServiceRoleClient();
	const userId = await resolveUserId(supabase);
	if (!userId) {
		return NextResponse.json({ error: "User not found" }, { status: 401 });
	}

	let body: { action?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (body.action !== "accept" && body.action !== "decline") {
		return NextResponse.json(
			{ error: "action must be 'accept' or 'decline'" },
			{ status: 422 },
		);
	}
	const action = body.action;

	const { id: debateId } = await params;

	// Fetch debate
	const { data: debate, error: debateError } = await supabase
		.from("debates")
		.select("id, status, conclusion_proposed_by")
		.eq("id", debateId)
		.single();

	if (debateError || !debate) {
		return NextResponse.json({ error: "Debate not found" }, { status: 404 });
	}

	if (debate.status !== "concluding") {
		return NextResponse.json(
			{ error: "No conclusion proposal to respond to" },
			{ status: 409 },
		);
	}

	// Verify caller is a participant
	const { data: participant } = await supabase
		.from("participants")
		.select("id, user_id")
		.eq("debate_id", debateId)
		.eq("user_id", userId)
		.single();

	if (!participant) {
		return NextResponse.json(
			{ error: "Only participants can respond to a conclusion proposal" },
			{ status: 403 },
		);
	}

	// Only the OPPONENT of the proposer can respond
	if (debate.conclusion_proposed_by === userId) {
		return NextResponse.json(
			{ error: "You cannot respond to your own conclusion proposal" },
			{ status: 403 },
		);
	}

	const updatePayload =
		action === "accept"
			? { status: "concluded" as const }
			: {
					status: "in_progress" as const,
					conclusion_proposed_by: null,
					conclusion_proposed_at: null,
				};

	const { data: updated, error: updateError } = await supabase
		.from("debates")
		.update(updatePayload)
		.eq("id", debateId)
		.select(
			"id, claim_text, creator_id, status, visibility, conclusion_proposed_by, conclusion_proposed_at, last_activity_at, created_at",
		)
		.single();

	if (updateError || !updated) {
		console.error("Failed to respond to conclusion:", updateError?.message);
		return NextResponse.json(
			{ error: "Failed to respond to conclusion" },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		debate: {
			id: updated.id,
			claimText: updated.claim_text,
			creatorId: updated.creator_id,
			status: updated.status,
			visibility: updated.visibility,
			conclusionProposedBy: updated.conclusion_proposed_by,
			conclusionProposedAt: updated.conclusion_proposed_at,
			lastActivityAt: updated.last_activity_at,
			createdAt: updated.created_at,
		},
	});
}
