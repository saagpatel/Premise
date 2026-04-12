import clsx from "clsx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Argument, DebateStatus, Participant } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<DebateStatus, string> = {
	open: "bg-blue-100 text-blue-800",
	in_progress: "bg-green-100 text-green-800",
	concluding: "bg-amber-100 text-amber-800",
	concluded: "bg-gray-100 text-gray-800",
	stalled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<DebateStatus, string> = {
	open: "Open",
	in_progress: "In Progress",
	concluding: "Concluding",
	concluded: "Concluded",
	stalled: "Stalled",
};

const ARGUMENT_TYPE_LABELS: Record<string, string> = {
	evidence: "Evidence",
	analogy: "Analogy",
	counterexample: "Counterexample",
	reductio: "Reductio",
	authority: "Authority",
	concession: "Concession",
	clarification: "Clarification",
};

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

/** Walk the argument list to compute depth of each node. */
function computeDepths(args: Argument[]): Map<string, number> {
	const depthMap = new Map<string, number>();
	const idSet = new Set(args.map((a) => a.id));

	function getDepth(id: string, visited = new Set<string>()): number {
		if (depthMap.has(id)) return depthMap.get(id)!;
		if (visited.has(id)) return 0; // cycle guard
		visited.add(id);

		const arg = args.find((a) => a.id === id);
		if (!arg || !arg.parentArgumentId || !idSet.has(arg.parentArgumentId)) {
			depthMap.set(id, 0);
			return 0;
		}
		const d = 1 + getDepth(arg.parentArgumentId, visited);
		depthMap.set(id, d);
		return d;
	}

	for (const arg of args) {
		getDepth(arg.id);
	}

	return depthMap;
}

// ── Metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const supabase = createServiceRoleClient();

	const { data: debateRow } = await supabase
		.from("debates")
		.select("claim_text")
		.eq("id", id)
		.single();

	if (!debateRow) {
		return { title: "Debate not found — Premise" };
	}

	const claimText = debateRow.claim_text as string;

	const { count: argCount } = await supabase
		.from("arguments")
		.select("*", { count: "exact", head: true })
		.eq("debate_id", id);

	const { count: voteCount } = await supabase
		.from("votes")
		.select("arguments!inner(debate_id)", { count: "exact", head: true })
		.eq("arguments.debate_id", id);

	const argNum = argCount ?? 0;
	const voteNum = voteCount ?? 0;
	const description = `${argNum} argument${argNum !== 1 ? "s" : ""}, ${voteNum} vote${voteNum !== 1 ? "s" : ""} — watch the structured debate`;

	return {
		title: `${claimText} — Premise`,
		description,
		openGraph: {
			title: `${claimText} — Premise`,
			description,
			type: "website",
		},
		twitter: {
			card: "summary",
			title: `${claimText} — Premise`,
			description,
		},
	};
}

// ── Page ──────────────────────────────────────────────────────────────

export default async function PublicDebatePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const supabase = createServiceRoleClient();
	const { id: debateId } = await params;

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

	const status = debateRow.status as DebateStatus;
	const visibility = debateRow.visibility as "public" | "private";
	const claimText = debateRow.claim_text as string;

	if (visibility === "private") {
		return (
			<main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
				<div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
					<p className="text-lg font-semibold text-gray-700">
						This debate is private.
					</p>
					<p className="mt-2 text-sm text-gray-400">
						You need an invite link to view it.
					</p>
				</div>
			</main>
		);
	}

	const { data: participantRows } = await supabase
		.from("participants")
		.select(
			"id, debate_id, user_id, side, joined_at, users(id, username, display_name)",
		)
		.eq("debate_id", debateId);

	const { data: argumentRows } = await supabase
		.from("arguments")
		.select(
			"id, debate_id, author_id, parent_argument_id, argument_type, content_text, side, net_vote_score, flag_count, created_at",
		)
		.eq("debate_id", debateId)
		.order("created_at", { ascending: true })
		.limit(50);

	const participants = (participantRows ?? []).map(
		(r: Record<string, unknown>) => mapParticipant(r),
	);
	const args = (argumentRows ?? []).map((r: Record<string, unknown>) =>
		mapArgument(r),
	);

	const forParticipants = participants.filter((p) => p.side === "for");
	const againstParticipants = participants.filter((p) => p.side === "against");

	const depthMap = computeDepths(args);

	function participantLabel(p: Participant): string {
		return p.user?.displayName ?? p.user?.username ?? "Anonymous";
	}

	return (
		<main className="min-h-screen bg-gray-50 px-4 py-12">
			<div className="mx-auto w-full max-w-2xl">
				{/* Header */}
				<div className="mb-8">
					<div className="mb-3 flex items-center gap-2">
						<span
							className={clsx(
								"rounded-full px-2.5 py-0.5 text-xs font-medium",
								STATUS_STYLES[status],
							)}
						>
							{STATUS_LABELS[status]}
						</span>
						<a
							href="/"
							className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
						>
							← Back to Premise
						</a>
					</div>
					<h1 className="text-2xl font-bold leading-snug text-gray-900">
						{claimText}
					</h1>
				</div>

				{/* Participants */}
				<div className="mb-8 grid grid-cols-2 gap-4">
					<div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-500">
							For
						</p>
						{forParticipants.length > 0 ? (
							forParticipants.map((p) => (
								<p key={p.id} className="text-sm font-medium text-blue-900">
									{participantLabel(p)}
								</p>
							))
						) : (
							<p className="text-sm text-blue-400 italic">No participant yet</p>
						)}
					</div>
					<div className="rounded-xl border border-red-100 bg-red-50 p-4">
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">
							Against
						</p>
						{againstParticipants.length > 0 ? (
							againstParticipants.map((p) => (
								<p key={p.id} className="text-sm font-medium text-red-900">
									{participantLabel(p)}
								</p>
							))
						) : (
							<p className="text-sm text-red-400 italic">No participant yet</p>
						)}
					</div>
				</div>

				{/* Arguments */}
				<section className="mb-10">
					<h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
						{args.length} argument{args.length !== 1 ? "s" : ""} in this debate
					</h2>

					{args.length === 0 ? (
						<p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
							No arguments yet.
						</p>
					) : (
						<div className="space-y-2">
							{args.map((arg) => {
								const depth = depthMap.get(arg.id) ?? 0;
								const indentStyle = { paddingLeft: `${depth * 20 + 16}px` };
								const isFor = arg.side === "for";

								return (
									<div
										key={arg.id}
										style={indentStyle}
										className={clsx(
											"relative rounded-lg border bg-white py-3 pr-4",
											isFor
												? "border-l-4 border-blue-300"
												: "border-l-4 border-red-300",
										)}
									>
										<div className="mb-1 flex items-center gap-2">
											<span
												className={clsx(
													"rounded px-1.5 py-0.5 text-xs font-medium",
													isFor
														? "bg-blue-50 text-blue-700"
														: "bg-red-50 text-red-700",
												)}
											>
												{ARGUMENT_TYPE_LABELS[arg.argumentType] ??
													arg.argumentType}
											</span>
											<span className="text-xs text-gray-400">
												{isFor ? "For" : "Against"}
											</span>
											{arg.netVoteScore !== 0 && (
												<span
													className={clsx(
														"ml-auto text-xs font-medium",
														arg.netVoteScore > 0
															? "text-green-600"
															: "text-red-500",
													)}
												>
													{arg.netVoteScore > 0 ? "+" : ""}
													{arg.netVoteScore}
												</span>
											)}
										</div>
										<p className="text-sm text-gray-800 leading-relaxed">
											{arg.contentText}
										</p>
									</div>
								);
							})}
						</div>
					)}
				</section>

				{/* CTA */}
				<div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
					<p className="mb-4 text-sm text-gray-600">
						Want to debate? Join this debate or start your own.
					</p>
					<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
						<a
							href={`/d/${debateId}?join=against`}
							className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
						>
							Join this debate
						</a>
						<a
							href="/"
							className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
						>
							Start your own
						</a>
					</div>
				</div>
			</div>
		</main>
	);
}
