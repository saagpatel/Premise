import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DebateProvider } from "@/components/debate/debate-provider";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Argument, Debate, Participant } from "@/types";

function mapDebate(row: Record<string, unknown>): Debate {
	return {
		id: row.id as string,
		claimText: row.claim_text as string,
		creatorId: row.creator_id as string,
		status: row.status as Debate["status"],
		visibility: row.visibility as Debate["visibility"],
		conclusionProposedBy: (row.conclusion_proposed_by as string) ?? null,
		conclusionProposedAt: (row.conclusion_proposed_at as string) ?? null,
		lastActivityAt: row.last_activity_at as string,
		createdAt: row.created_at as string,
	};
}

function mapParticipant(row: Record<string, unknown>): Participant {
	const user = row.users as Record<string, unknown> | null;
	return {
		id: row.id as string,
		debateId: row.debate_id as string,
		userId: row.user_id as string,
		side: row.side as Participant["side"],
		joinedAt: row.joined_at as string,
		user: user
			? {
					id: user.id as string,
					authId: null,
					anonId: null,
					username: (user.username as string) ?? null,
					displayName: (user.display_name as string) ?? null,
					debatesParticipated: 0,
					createdAt: "",
				}
			: undefined,
	};
}

function mapArgument(row: Record<string, unknown>): Argument {
	return {
		id: row.id as string,
		debateId: row.debate_id as string,
		authorId: row.author_id as string,
		parentArgumentId: (row.parent_argument_id as string) ?? null,
		argumentType: row.argument_type as Argument["argumentType"],
		contentText: row.content_text as string,
		side: row.side as Argument["side"],
		netVoteScore: row.net_vote_score as number,
		flagCount: row.flag_count as number,
		createdAt: row.created_at as string,
	};
}

export default async function DebateLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: { id: string };
}) {
	const supabase = createServiceRoleClient();
	const debateId = params.id;

	// Resolve current user from anon cookie
	const cookieStore = cookies();
	const anonCookie = cookieStore.get("premise-anon-id");
	let currentUserId: string | null = null;

	if (anonCookie?.value) {
		const { data: user } = await supabase
			.from("users")
			.select("id")
			.eq("anon_id", anonCookie.value)
			.single();
		currentUserId = user?.id ?? null;
	}

	// Fetch debate
	const { data: debateRow, error: debateError } = await supabase
		.from("debates")
		.select(
			"id, claim_text, creator_id, status, visibility, conclusion_proposed_by, conclusion_proposed_at, last_activity_at, created_at",
		)
		.eq("id", debateId)
		.single();

	if (debateError || !debateRow) {
		notFound();
	}

	// Fetch participants
	const { data: participantRows } = await supabase
		.from("participants")
		.select(
			"id, debate_id, user_id, side, joined_at, users(id, username, display_name)",
		)
		.eq("debate_id", debateId);

	// Join flow handled client-side via POST /api/debates/[id]/join
	// (layouts don't have access to searchParams in Next.js 14)

	// Fetch arguments
	const { data: argumentRows } = await supabase
		.from("arguments")
		.select(
			"id, debate_id, author_id, parent_argument_id, argument_type, content_text, side, net_vote_score, flag_count, created_at",
		)
		.eq("debate_id", debateId)
		.order("created_at", { ascending: true });

	const debate = mapDebate(debateRow);
	const participants = (participantRows ?? []).map(
		(r: Record<string, unknown>) => mapParticipant(r),
	);
	const args = (argumentRows ?? []).map((r: Record<string, unknown>) =>
		mapArgument(r),
	);

	return (
		<DebateProvider
			initialDebate={debate}
			initialParticipants={participants}
			initialArguments={args}
			currentUserId={currentUserId}
		>
			{children}
		</DebateProvider>
	);
}
