import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDebateChannel } from "./realtime";

type Handler = {
	event: string;
	table: string;
	filter?: string;
	callback: (payload: { new: Record<string, unknown> }) => void;
};

class FakeChannel {
	handlers: Handler[] = [];
	subscribeStatus: ((status: string) => void) | null = null;

	on(
		event: string,
		config: { table: string; filter?: string },
		callback: (payload: { new: Record<string, unknown> }) => void,
	) {
		this.handlers.push({ event, table: config.table, filter: config.filter, callback });
		return this;
	}

	subscribe(callback: (status: string) => void) {
		this.subscribeStatus = callback;
		callback("SUBSCRIBED");
		return this;
	}

	emit(table: string, row: Record<string, unknown>) {
		for (const handler of this.handlers) {
			if (handler.table === table) handler.callback({ new: row });
		}
	}
}

class FakeSupabase {
	readonly channelInstance = new FakeChannel();
	removedChannel: FakeChannel | null = null;

	channel() {
		return this.channelInstance;
	}

	removeChannel(channel: FakeChannel) {
		this.removedChannel = channel;
		return Promise.resolve("ok");
	}
}

const argument = (id: string, debateId = "debate-1") => ({
	id,
	debate_id: debateId,
	author_id: "user-1",
	parent_argument_id: null,
	argument_type: "evidence",
	content_text: "argument",
	side: "for",
	net_vote_score: 0,
	flag_count: 0,
	created_at: "2026-01-01T00:00:00Z",
});

describe("createDebateChannel", () => {
	it("accepts initial and newly inserted debate arguments, but filters unknown votes", () => {
		const supabase = new FakeSupabase();
		const argumentsReceived: string[] = [];
		const votesReceived: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: (arg) => argumentsReceived.push(arg.id),
				onVote: ({ argumentId }) => votesReceived.push(argumentId),
			},
			new Set(["initial-argument"]),
		);

		channel.subscribe();
		supabase.channelInstance.emit("votes", {
			argument_id: "initial-argument",
			vote: "strong",
			voter_id: "user-2",
		});
		supabase.channelInstance.emit("votes", {
			argument_id: "other-debate-argument",
			vote: "strong",
			voter_id: "user-2",
		});
		supabase.channelInstance.emit("arguments", argument("new-argument"));
		supabase.channelInstance.emit("votes", {
			argument_id: "new-argument",
			vote: "weak",
			voter_id: "user-2",
		});

		expect(argumentsReceived).toEqual(["new-argument"]);
		expect(votesReceived).toEqual(["initial-argument", "new-argument"]);
		expect(
			supabase.channelInstance.handlers.find((handler) => handler.table === "arguments")
				?.filter,
	).toBe("debate_id=eq.debate-1");
		channel.unsubscribe();
		expect(supabase.removedChannel).toBe(supabase.channelInstance);
	});

	it("buffers vote-before-argument events and never admits a foreign argument", () => {
		const supabase = new FakeSupabase();
		const argumentsReceived: string[] = [];
		const votesReceived: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: (arg) => argumentsReceived.push(arg.id),
				onVote: ({ argumentId }) => votesReceived.push(argumentId),
			},
		);

		channel.subscribe();
		supabase.channelInstance.emit("votes", {
			argument_id: "new-argument",
			vote: "strong",
			voter_id: "user-2",
		});
		expect(votesReceived).toEqual([]);

		supabase.channelInstance.emit("arguments", argument("new-argument"));
		expect(argumentsReceived).toEqual(["new-argument"]);
		expect(votesReceived).toEqual(["new-argument"]);

		supabase.channelInstance.emit(
			"arguments",
			argument("foreign-argument", "debate-2"),
		);
		supabase.channelInstance.emit("votes", {
			argument_id: "foreign-argument",
			vote: "strong",
			voter_id: "user-2",
		});
		expect(argumentsReceived).toEqual(["new-argument"]);
		expect(votesReceived).toEqual(["new-argument"]);
		channel.unsubscribe();
	});

	it("suppresses only the originating tab's registered vote echo", () => {
		const supabase = new FakeSupabase();
		const votesReceived: Array<{ argumentId: string; voterId: string }> = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onVote: ({ argumentId, voterId }) =>
					votesReceived.push({ argumentId, voterId }),
			},
			new Set(["argument-1"]),
			"user-1",
		);

		channel.subscribe();
		channel.registerLocalVote("argument-1");
		supabase.channelInstance.emit("votes", {
			argument_id: "argument-1",
			vote: "strong",
			voter_id: "user-1",
		});
		expect(votesReceived).toEqual([]);

		// A second tab has no pending local vote, so the same voter event is
		// still delivered there rather than being filtered by user identity.
		supabase.channelInstance.emit("votes", {
			argument_id: "argument-1",
			vote: "strong",
			voter_id: "user-1",
		});
		expect(votesReceived).toEqual([{ argumentId: "argument-1", voterId: "user-1" }]);
		channel.unsubscribe();
	});

	it("reconciles refreshed IDs without replaying stale buffered deltas", () => {
		const supabase = new FakeSupabase();
		const votesReceived: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onVote: ({ argumentId }) => votesReceived.push(argumentId),
			},
		);

		channel.subscribe();
		supabase.channelInstance.emit("votes", {
			argument_id: "refreshed-argument",
			vote: "weak",
			voter_id: "user-2",
		});
		expect(votesReceived).toEqual([]);
		channel.reconcileArgumentIds(["refreshed-argument"]);
		// The refresh supplied an authoritative score, so the pre-refresh
		// buffered event must be discarded rather than added again.
		expect(votesReceived).toEqual([]);
		supabase.channelInstance.emit("votes", {
			argument_id: "refreshed-argument",
			vote: "weak",
			voter_id: "user-3",
		});
		expect(votesReceived).toEqual(["refreshed-argument"]);
		channel.unsubscribe();
	});

	it("retains arguments observed during a refresh interleaving", () => {
		const supabase = new FakeSupabase();
		const votesReceived: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onVote: ({ argumentId }) => votesReceived.push(argumentId),
			},
			new Set(["observed-before-refresh"]),
		);

		channel.subscribe();
		// This ID represents an argument learned by realtime while the refresh
		// request was in flight; reconciliation must not remove its membership.
		supabase.channelInstance.emit("arguments", argument("concurrent-argument"));
		channel.reconcileArgumentIds(["returned-by-refresh"]);
		supabase.channelInstance.emit("votes", {
			argument_id: "concurrent-argument",
			vote: "strong",
			voter_id: "user-2",
		});
		expect(votesReceived).toEqual(["concurrent-argument"]);
		channel.unsubscribe();
	});

	it("ignores malformed vote payloads", () => {
		const supabase = new FakeSupabase();
		const votesReceived: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onVote: ({ argumentId }) => votesReceived.push(argumentId),
			},
			new Set(["argument-1"]),
		);

		channel.subscribe();
		supabase.channelInstance.emit("votes", {
			argument_id: "argument-1",
			vote: "not-a-vote",
			voter_id: "user-2",
		});
		supabase.channelInstance.emit("votes", {
			argument_id: "argument-1",
			vote: "strong",
		});
		expect(votesReceived).toEqual([]);
		channel.unsubscribe();
	});

	it("reports subscription state transitions", () => {
		const supabase = new FakeSupabase();
		const states: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{ onArgument: () => {}, onVote: () => {} },
		);
		channel.onStateChange((state) => states.push(state));
		channel.subscribe();
		supabase.channelInstance.subscribeStatus?.("CHANNEL_ERROR");
		supabase.channelInstance.subscribeStatus?.("CLOSED");
		channel.unsubscribe();

		expect(states).toEqual(["live", "reconnecting", "paused"]);
	});

	it("clears the previous heartbeat when SUBSCRIBED repeats and on cleanup", () => {
		vi.useFakeTimers();
		try {
			const supabase = new FakeSupabase();
			const votesReceived: string[] = [];
			const channel = createDebateChannel(
				"debate-1",
				supabase as unknown as SupabaseClient,
				{
					onArgument: () => {},
					onVote: ({ argumentId }) => votesReceived.push(argumentId),
				},
				new Set(["argument-1"]),
			);

			channel.subscribe();
			expect(vi.getTimerCount()).toBe(1);
			supabase.channelInstance.subscribeStatus?.("SUBSCRIBED");
			expect(vi.getTimerCount()).toBe(1);
			channel.unsubscribe();
			expect(vi.getTimerCount()).toBe(0);
			supabase.channelInstance.emit("votes", {
				argument_id: "argument-1",
				vote: "strong",
				voter_id: "user-2",
			});
			expect(votesReceived).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});
