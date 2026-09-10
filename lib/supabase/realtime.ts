import type { SupabaseClient } from "@supabase/supabase-js";
import type { Argument, ConnectionState } from "@/types";

export type { ConnectionState };

type Callbacks = {
	onArgument: (arg: Argument) => void;
	onArgumentUpdate: (arg: Argument) => void;
};

type DebateArgumentIds = Iterable<string>;

const MAX_PENDING_ARGUMENT_UPDATES = 256;

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
	// Track which argument IDs belong to this debate so argument updates from
	// other debates (delivered before server-side filtering) cannot be admitted.
	const debateArgumentIds = new Set(initialArgumentIds);
	const pendingArgumentUpdates = new Map<string, Argument>();

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

	function flushPendingArgumentUpdate(argumentId: string) {
		const arg = pendingArgumentUpdates.get(argumentId);
		if (!arg) return;
		pendingArgumentUpdates.delete(argumentId);
		callbacks.onArgumentUpdate(arg);
	}

	function rememberPendingArgumentUpdate(arg: Argument) {
		pendingArgumentUpdates.set(arg.id, arg);

		// Realtime has no replay for an event missed during subscription. Keep a
		// bounded queue so an unknown/foreign stream cannot grow this channel
		// without limit; entries are released when their argument is proven local.
		while (pendingArgumentUpdates.size > MAX_PENDING_ARGUMENT_UPDATES) {
			const oldest = pendingArgumentUpdates.entries().next().value as
				| [string, Argument]
				| undefined;
			if (!oldest) break;
			pendingArgumentUpdates.delete(oldest[0]);
		}
	}

	function reconcileArgumentIds(argumentIds: DebateArgumentIds) {
		const refreshedArgumentIds = new Set(argumentIds);
		// Arguments are append-only in the debate model. Preserve IDs learned
		// concurrently by realtime while admitting rows recovered by refresh.
		for (const argumentId of refreshedArgumentIds) {
			debateArgumentIds.add(argumentId);
		}

		// A refresh supplies authoritative scores, so buffered updates for rows it
		// knows about must not be replayed on top of those scores.
		for (const argumentId of refreshedArgumentIds) {
			pendingArgumentUpdates.delete(argumentId);
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
				// replayed updates are applied after the argument enters local state.
				debateArgumentIds.add(arg.id);
				callbacks.onArgument(arg);
				flushPendingArgumentUpdate(arg.id);
			},
		)
		.on(
			"postgres_changes",
			{
				event: "UPDATE",
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
					row.debate_id !== debateId ||
					typeof row.net_vote_score !== "number" ||
					!Number.isFinite(row.net_vote_score)
				) {
					return;
				}
				const arg = mapRowToArgument(row);
				// UPDATE carries the authoritative net_vote_score from the database;
				// never apply a vote delta on top of the optimistic/local score.
				if (!debateArgumentIds.has(arg.id)) {
					rememberPendingArgumentUpdate(arg);
					return;
				}
				callbacks.onArgumentUpdate(arg);
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
			pendingArgumentUpdates.clear();
			supabase.removeChannel(channel);
			setState("paused");
		},

		reconcileArgumentIds,

		getConnectionState(): ConnectionState {
			return connectionState;
		},

		onStateChange(cb: (state: ConnectionState) => void): void {
			stateChangeListeners.push(cb);
		},
	};
}
