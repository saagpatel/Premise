import type { SupabaseClient } from "@supabase/supabase-js";
import type { Argument, ConnectionState } from "@/types";

export type { ConnectionState };

type Callbacks = {
	onArgument: (arg: Argument) => void;
	onVote: (data: { argumentId: string; vote: string }) => void;
};

// Mutable set of argument IDs belonging to the current debate.
// Updated by the argument INSERT handler so vote events can be filtered.
type DebateArgumentIds = Set<string>;

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
) {
	// Track which argument IDs belong to this debate so vote events for other
	// debates (delivered before server-side filtering) can be discarded.
	const debateArgumentIds: DebateArgumentIds = new Set(initialArgumentIds);

	let connectionState: ConnectionState = "paused";
	const stateChangeListeners: Array<(state: ConnectionState) => void> = [];
	let lastEventAt = Date.now();
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	function setState(next: ConnectionState) {
		if (next === connectionState) return;
		connectionState = next;
		for (const listener of stateChangeListeners) {
			listener(next);
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
				lastEventAt = Date.now();
				const row = payload.new as Record<string, unknown>;
				const arg = mapRowToArgument(row);
				// Register new argument so subsequent vote events can be matched.
				debateArgumentIds.add(arg.id);
				callbacks.onArgument(arg);
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
				lastEventAt = Date.now();
				const row = payload.new as Record<string, unknown>;
				const argumentId = row.argument_id as string;
				// Discard vote events that belong to a different debate.
				// Supabase realtime doesn't support filtering on a join column, so
				// we filter client-side using the set of known argument IDs.
				if (!debateArgumentIds.has(argumentId)) return;
				callbacks.onVote({ argumentId, vote: row.vote as string });
			},
		);

	return {
		subscribe(): void {
			channel.subscribe((status) => {
				if (status === "SUBSCRIBED") {
					setState("live");
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
			if (heartbeatTimer !== null) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
			supabase.removeChannel(channel);
			setState("paused");
		},

		getConnectionState(): ConnectionState {
			return connectionState;
		},

		onStateChange(cb: (state: ConnectionState) => void): void {
			stateChangeListeners.push(cb);
		},
	};
}
