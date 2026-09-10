import type { SupabaseClient } from "@supabase/supabase-js";
import type { Argument, ConnectionState } from "@/types";

export type { ConnectionState };

type Callbacks = {
	onArgument: (arg: Argument) => void;
	onVote: (data: { argumentId: string; vote: string; voterId: string }) => void;
};

type DebateArgumentIds = Iterable<string>;
type VoteEvent = {
	argumentId: string;
	vote: string;
	voterId: string;
};

const MAX_PENDING_VOTES = 256;

function mapRowToArgument(row: Record<string, unknown>): Argument {
	return {
		id: row.id as string,
		debateId: row.debate_id as string,
		authorId: row.author_id as string,
		parentArgumentId: (row.parent_argument_id as string | null) ?? null,
		argumentType: row.argument_type as Argument["argumentType"],
		contentText: row.content_text as string,
		side: row.side as Argument["side"],
		netVoteScore: row.net_vote_score as number,
		flagCount: row.flag_count as number,
		createdAt: row.created_at as string,
	};
}

export function createDebateChannel(
	debateId: string,
	supabase: SupabaseClient,
	callbacks: Callbacks,
	initialArgumentIds: DebateArgumentIds = new Set(),
	localVoterId: string | null = null,
) {
	// Track which argument IDs belong to this debate so vote events for other
	// debates (delivered before server-side filtering) cannot be admitted.
	const debateArgumentIds = new Set(initialArgumentIds);
	const pendingVotes = new Map<string, VoteEvent[]>();
	const localVotesAwaitingEcho = new Set<string>();
	let pendingVoteCount = 0;

	let connectionState: ConnectionState = "paused";
	const stateChangeListeners: Array<(state: ConnectionState) => void> = [];
	let lastEventAt = Date.now();
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let stopped = false;

	function setState(next: ConnectionState) {
		if (next === connectionState) return;
		connectionState = next;
		for (const listener of stateChangeListeners) {
			listener(next);
		}
	}

	function dispatchVote(event: VoteEvent) {
		// The originating tab applies its own vote optimistically. Consume only
		// the matching local echo; other tabs still receive the same vote event.
		if (
			localVoterId !== null &&
			event.voterId === localVoterId &&
			localVotesAwaitingEcho.delete(event.argumentId)
		) {
			return;
		}
		callbacks.onVote(event);
	}

	function flushPendingVotes(argumentId: string) {
		const votes = pendingVotes.get(argumentId);
		if (!votes) return;
		pendingVotes.delete(argumentId);
		pendingVoteCount -= votes.length;
		for (const vote of votes) dispatchVote(vote);
	}

	function rememberPendingVote(event: VoteEvent) {
		const votes = pendingVotes.get(event.argumentId) ?? [];
		votes.push(event);
		pendingVotes.set(event.argumentId, votes);
		pendingVoteCount += 1;

		// Realtime has no replay for an event missed during subscription. Keep a
		// bounded queue so an unknown/foreign stream cannot grow this channel
		// without limit; entries are released when their argument is proven local.
		while (pendingVoteCount > MAX_PENDING_VOTES) {
			const oldest = pendingVotes.entries().next().value as
				| [string, VoteEvent[]]
				| undefined;
			if (!oldest) break;
			const [oldestArgumentId, oldestVotes] = oldest;
			oldestVotes.shift();
			pendingVoteCount -= 1;
			if (oldestVotes.length === 0) pendingVotes.delete(oldestArgumentId);
		}
	}

	function reconcileArgumentIds(argumentIds: DebateArgumentIds) {
		const refreshedArgumentIds = new Set(argumentIds);
		// Arguments are append-only in the debate model. Preserve IDs learned
		// concurrently by realtime while admitting rows recovered by refresh.
		for (const argumentId of refreshedArgumentIds) {
			debateArgumentIds.add(argumentId);
		}

		// A refresh supplies authoritative scores, so buffered deltas for rows it
		// knows about must not be replayed on top of those scores.
		for (const argumentId of refreshedArgumentIds) {
			const votes = pendingVotes.get(argumentId);
			if (!votes) continue;
			pendingVotes.delete(argumentId);
			pendingVoteCount -= votes.length;
		}
	}

	const channel = supabase
		.channel(`debate-${debateId}`)
		.on(
			"postgres_changes",
			{
				event: "INSERT",
				schema: "public",
				table: "arguments",
				filter: `debate_id=eq.${debateId}`,
			},
			(payload) => {
				if (stopped) return;
				lastEventAt = Date.now();
				const row = payload.new as Record<string, unknown>;
				if (
					typeof row.id !== "string" ||
					row.id.length === 0 ||
					row.debate_id !== debateId
				) {
					return;
				}
				const arg = mapRowToArgument(row);
				// The server-side filter is required for efficiency; retain this
				// check as a defense-in-depth boundary before admitting membership.
				if (arg.debateId !== debateId) return;
				// A realtime INSERT proves membership. Notify the consumer first so
				// replayed votes are applied after the argument enters local state.
				debateArgumentIds.add(arg.id);
				callbacks.onArgument(arg);
				flushPendingVotes(arg.id);
			},
		)
		.on(
			"postgres_changes",
			{
				event: "INSERT",
				schema: "public",
				table: "votes",
			},
			(payload) => {
				if (stopped) return;
				lastEventAt = Date.now();
				const row = payload.new as Record<string, unknown>;
				const argumentId = row.argument_id;
				const vote = row.vote;
				const voterId = row.voter_id;
				if (
					typeof argumentId !== "string" ||
					argumentId.length === 0 ||
					(vote !== "strong" && vote !== "weak") ||
					typeof voterId !== "string" ||
					voterId.length === 0
				) {
					return;
				}
				const event: VoteEvent = {
					argumentId,
					vote,
					voterId,
				};
				// Supabase realtime doesn't support filtering on a join column. Hold
				// unknown IDs until a local argument INSERT or refresh proves membership;
				// otherwise an event from another debate is never dispatched.
				if (!debateArgumentIds.has(argumentId)) {
					rememberPendingVote(event);
					return;
				}
				dispatchVote(event);
			},
		);

	return {
		subscribe(): void {
			stopped = false;
			channel.subscribe((status) => {
				if (stopped) return;
				if (status === "SUBSCRIBED") {
					setState("live");
					if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
					heartbeatTimer = setInterval(() => {
						if (Date.now() - lastEventAt > 30_000) {
							// Channel is stale — notify consumer so they can resync if needed.
							// We do not change state here; the channel is still connected.
						}
					}, 30_000);
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					setState("reconnecting");
				} else if (status === "CLOSED") {
					setState("paused");
				}
			});
		},

		unsubscribe(): void {
			stopped = true;
			if (heartbeatTimer !== null) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
			pendingVotes.clear();
			pendingVoteCount = 0;
			localVotesAwaitingEcho.clear();
			supabase.removeChannel(channel);
			setState("paused");
		},

		reconcileArgumentIds,

		registerLocalVote(argumentId: string): void {
			if (localVoterId !== null) localVotesAwaitingEcho.add(argumentId);
		},

		cancelLocalVote(argumentId: string): void {
			localVotesAwaitingEcho.delete(argumentId);
		},

		getConnectionState(): ConnectionState {
			return connectionState;
		},

		onStateChange(cb: (state: ConnectionState) => void): void {
			stateChangeListeners.push(cb);
		},
	};
}
