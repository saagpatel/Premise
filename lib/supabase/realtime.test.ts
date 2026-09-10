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
		_event: string,
		config: { event: string; table: string; filter?: string },
		callback: (payload: { new: Record<string, unknown> }) => void,
	) {
		this.handlers.push({
			event: config.event,
			table: config.table,
			filter: config.filter,
			callback,
		});
		return this;
	}

	subscribe(callback: (status: string) => void) {
		this.subscribeStatus = callback;
		callback("SUBSCRIBED");
		return this;
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

const argument = (id: string, debateId = "debate-1", score = 0) => ({
	id,
	debate_id: debateId,
	author_id: "user-1",
	parent_argument_id: null,
	argument_type: "evidence",
	content_text: "argument",
	side: "for",
	net_vote_score: score,
	flag_count: 0,
	created_at: "2026-01-01T00:00:00Z",
});

function handlerFor(supabase: FakeSupabase, event: "INSERT" | "UPDATE") {
	return supabase.channelInstance.handlers.find(
		(handler) => handler.table === "arguments" &&
			handler.event === event &&
			handler.filter === "debate_id=eq.debate-1",
	);
}

describe("createDebateChannel", () => {
	it("accepts initial/new arguments and authoritative score updates", () => {
		const supabase = new FakeSupabase();
		const argumentsReceived: string[] = [];
		const updatesReceived: Array<{ id: string; score: number }> = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: (arg) => argumentsReceived.push(arg.id),
				onArgumentUpdate: (arg) =>
					updatesReceived.push({ id: arg.id, score: arg.netVoteScore }),
			},
			new Set(["initial-argument"]),
		);

		channel.subscribe();
		const insertHandler = handlerFor(supabase, "INSERT");
		const updateHandler = handlerFor(supabase, "UPDATE");
		updateHandler?.callback({ new: argument("initial-argument", "debate-1", 4) });
		insertHandler?.callback({ new: argument("new-argument") });
		updateHandler?.callback({ new: argument("new-argument", "debate-1", -2) });
		insertHandler?.callback({ new: argument("foreign-argument", "debate-2", 9) });

		expect(argumentsReceived).toEqual(["new-argument"]);
		expect(updatesReceived).toEqual([
			{ id: "initial-argument", score: 4 },
			{ id: "new-argument", score: -2 },
		]);
		expect(
			supabase.channelInstance.handlers
				.filter((handler) => handler.table === "arguments")
				.map((handler) => handler.filter),
		).toEqual(["debate_id=eq.debate-1", "debate_id=eq.debate-1"]);
		channel.unsubscribe();
	});

	it("buffers update-before-argument and replays it after membership is proven", () => {
		const supabase = new FakeSupabase();
		const events: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: (arg) => events.push(`insert:${arg.id}`),
				onArgumentUpdate: (arg) => events.push(`update:${arg.id}:${arg.netVoteScore}`),
			},
		);

		channel.subscribe();
		const insertHandler = handlerFor(supabase, "INSERT");
		const updateHandler = handlerFor(supabase, "UPDATE");
		updateHandler?.callback({ new: argument("late-argument", "debate-1", 7) });
		expect(events).toEqual([]);
		insertHandler?.callback({ new: argument("late-argument") });
		expect(events).toEqual(["insert:late-argument", "update:late-argument:7"]);
		channel.unsubscribe();
	});

	it("discards stale updates covered by refresh, then applies delayed authoritative updates exactly", () => {
		const supabase = new FakeSupabase();
		const scores: number[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onArgumentUpdate: (arg) => scores.push(arg.netVoteScore),
			},
		);

		channel.subscribe();
		const updateHandler = handlerFor(supabase, "UPDATE");
		const delayed = argument("refreshed-argument", "debate-1", 1);
		updateHandler?.callback({ new: delayed });
		expect(scores).toEqual([]);

		// The refresh already contains score 1; do not replay the buffered update.
		channel.reconcileArgumentIds(["refreshed-argument"]);
		expect(scores).toEqual([]);
		// A delayed post-refresh UPDATE sets the score, never adds a delta.
		updateHandler?.callback({ new: delayed });
		expect(scores).toEqual([1]);
		channel.unsubscribe();
	});

	it("retains arguments observed during a refresh interleaving", () => {
		const supabase = new FakeSupabase();
		const updates: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onArgumentUpdate: (arg) => updates.push(arg.id),
			},
		);

		channel.subscribe();
		const insertHandler = handlerFor(supabase, "INSERT");
		const updateHandler = handlerFor(supabase, "UPDATE");
		insertHandler?.callback({ new: argument("concurrent-argument") });
		channel.reconcileArgumentIds(["returned-by-refresh"]);
		updateHandler?.callback({ new: argument("concurrent-argument", "debate-1", 3) });
		expect(updates).toEqual(["concurrent-argument"]);
		channel.unsubscribe();
	});

	it("converges optimistic sender and other tab to the same authoritative score", () => {
		const senderSupabase = new FakeSupabase();
		const otherSupabase = new FakeSupabase();
		let senderScore = 1; // local optimistic strong vote
		let otherScore = 0;
		const sender = createDebateChannel(
			"debate-1",
			senderSupabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onArgumentUpdate: (arg) => (senderScore = arg.netVoteScore),
			},
			new Set(["argument-1"]),
		);
		const other = createDebateChannel(
			"debate-1",
			otherSupabase as unknown as SupabaseClient,
			{
				onArgument: () => {},
				onArgumentUpdate: (arg) => (otherScore = arg.netVoteScore),
			},
			new Set(["argument-1"]),
		);

		sender.subscribe();
		other.subscribe();
		const authoritative = argument("argument-1", "debate-1", 1);
		for (const fake of [senderSupabase, otherSupabase]) {
			handlerFor(fake, "UPDATE")?.callback({ new: authoritative });
		}
		expect(senderScore).toBe(1);
		expect(otherScore).toBe(1);
		sender.unsubscribe();
		other.unsubscribe();
	});

	it("ignores malformed argument update payloads", () => {
		const supabase = new FakeSupabase();
		const updates: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{ onArgument: () => {}, onArgumentUpdate: (arg) => updates.push(arg.id) },
			new Set(["argument-1"]),
		);

		channel.subscribe();
		const updateHandler = handlerFor(supabase, "UPDATE");
		updateHandler?.callback({
			new: { ...argument("argument-1"), net_vote_score: "1" },
		});
		updateHandler?.callback({
			new: { ...argument("argument-1"), debate_id: "debate-2" },
		});
		expect(updates).toEqual([]);
		channel.unsubscribe();
	});

	it("reports subscription state transitions", () => {
		const supabase = new FakeSupabase();
		const states: string[] = [];
		const channel = createDebateChannel(
			"debate-1",
			supabase as unknown as SupabaseClient,
			{ onArgument: () => {}, onArgumentUpdate: () => {} },
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
			const updates: string[] = [];
			const channel = createDebateChannel(
				"debate-1",
				supabase as unknown as SupabaseClient,
				{
					onArgument: () => {},
					onArgumentUpdate: (arg) => updates.push(arg.id),
				},
				new Set(["argument-1"]),
			);

			channel.subscribe();
			expect(vi.getTimerCount()).toBe(1);
			supabase.channelInstance.subscribeStatus?.("SUBSCRIBED");
			expect(vi.getTimerCount()).toBe(1);
			channel.unsubscribe();
			expect(vi.getTimerCount()).toBe(0);
			const updateHandler = handlerFor(supabase, "UPDATE");
			updateHandler?.callback({ new: argument("argument-1", "debate-1", 2) });
			expect(updates).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});
