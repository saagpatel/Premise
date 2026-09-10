import { describe, expect, it } from "vitest";
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

const argument = (id: string) => ({
	id,
	debate_id: "debate-1",
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
		});
		supabase.channelInstance.emit("votes", {
			argument_id: "other-debate-argument",
			vote: "strong",
		});
		supabase.channelInstance.emit("arguments", argument("new-argument"));
		supabase.channelInstance.emit("votes", {
			argument_id: "new-argument",
			vote: "weak",
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
});
