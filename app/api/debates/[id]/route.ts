import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Argument } from "@/types";

function buildTree(args: Argument[]): Argument[] {
	const byId = new Map<string, Argument>();
	for (const arg of args) {
		byId.set(arg.id, { ...arg, children: [] });
	}

	const roots: Argument[] = [];
	for (const arg of Array.from(byId.values())) {
		if (arg.parentArgumentId && byId.has(arg.parentArgumentId)) {
			const parent = byId.get(arg.parentArgumentId)!; // safe: checked has()
			parent.children = parent.children ?? [];
			parent.children.push(arg);
		} else {
			roots.push(arg);
		}
	}

	return roots;
}

export async function GET(
	_request: Request,
	{ params }: { params: { id: string } },
) {
	const supabase = createServerSupabaseClient();
	const debateId = params.id;

	try {
		// Fetch debate
		const { data: debate, error: debateError } = await supabase
			.from("debates")
			.select(
				"id, claim_text, creator_id, status, visibility, conclusion_proposed_by, conclusion_proposed_at, last_activity_at, created_at",
			)
			.eq("id", debateId)
			.single();

		if (debateError || !debate) {
			return NextResponse.json({ error: "Debate not found" }, { status: 404 });
		}

		// Fetch participants with user info
		const { data: participants, error: participantsError } = await supabase
			.from("participants")
			.select(
				"id, debate_id, user_id, side, joined_at, users(id, username, display_name)",
			)
			.eq("debate_id", debateId);

		if (participantsError) {
			console.error("Failed to fetch participants:", participantsError.message);
			return NextResponse.json(
				{ error: "Failed to fetch debate data" },
				{ status: 500 },
			);
		}

		// Fetch arguments ordered by creation time
		const { data: args, error: argsError } = await supabase
			.from("arguments")
			.select(
				"id, debate_id, author_id, parent_argument_id, argument_type, content_text, side, net_vote_score, flag_count, created_at",
			)
			.eq("debate_id", debateId)
			.order("created_at", { ascending: true });

		if (argsError) {
			console.error("Failed to fetch arguments:", argsError.message);
			return NextResponse.json(
				{ error: "Failed to fetch debate data" },
				{ status: 500 },
			);
		}

		// Map snake_case DB columns to camelCase TypeScript interfaces
		const mappedArgs: Argument[] = (args ?? []).map((a) => ({
			id: a.id,
			debateId: a.debate_id,
			authorId: a.author_id,
			parentArgumentId: a.parent_argument_id,
			argumentType: a.argument_type,
			contentText: a.content_text,
			side: a.side,
			netVoteScore: a.net_vote_score,
			flagCount: a.flag_count,
			createdAt: a.created_at,
		}));

		const tree = buildTree(mappedArgs);

		return NextResponse.json({
			debate: {
				id: debate.id,
				claimText: debate.claim_text,
				creatorId: debate.creator_id,
				status: debate.status,
				visibility: debate.visibility,
				conclusionProposedBy: debate.conclusion_proposed_by,
				conclusionProposedAt: debate.conclusion_proposed_at,
				lastActivityAt: debate.last_activity_at,
				createdAt: debate.created_at,
			},
			participants: (participants ?? []).map((p: Record<string, unknown>) => ({
				id: p.id,
				debateId: p.debate_id,
				userId: p.user_id,
				side: p.side,
				joinedAt: p.joined_at,
				user: p.users ?? null,
			})),
			tree,
		});
	} catch (err) {
		console.error("Unexpected error fetching debate:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
