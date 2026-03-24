"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createDebateChannel } from "@/lib/supabase/realtime";
import type {
	Argument,
	ConnectionState,
	Debate,
	DebateSide,
	Participant,
	VoteValue,
} from "@/types";

interface DebateContextValue {
	debate: Debate;
	participants: Participant[];
	arguments: Argument[];
	currentUserId: string | null;
	isParticipant: boolean;
	userSide: DebateSide | null;
	connectionState: ConnectionState;
	userVotes: Set<string>;
	refreshDebate: () => Promise<void>;
	castVote: (argumentId: string, vote: VoteValue) => Promise<void>;
	proposeConclusion: () => Promise<void>;
	respondToConclusion: (action: "accept" | "decline") => Promise<void>;
}

const DebateContext = createContext<DebateContextValue | null>(null);

export function useDebate(): DebateContextValue {
	const ctx = useContext(DebateContext);
	if (!ctx) throw new Error("useDebate must be used within DebateProvider");
	return ctx;
}

function loadUserVotes(debateId: string): Set<string> {
	try {
		const raw = sessionStorage.getItem(`premise-votes-${debateId}`);
		if (raw) return new Set(JSON.parse(raw) as string[]);
	} catch {
		// sessionStorage unavailable or corrupt
	}
	return new Set();
}

function saveUserVotes(debateId: string, votes: Set<string>) {
	try {
		sessionStorage.setItem(
			`premise-votes-${debateId}`,
			JSON.stringify(Array.from(votes)),
		);
	} catch {
		// sessionStorage unavailable
	}
}

export function DebateProvider({
	initialDebate,
	initialParticipants,
	initialArguments,
	currentUserId,
	children,
}: {
	initialDebate: Debate;
	initialParticipants: Participant[];
	initialArguments: Argument[];
	currentUserId: string | null;
	children: React.ReactNode;
}) {
	const [debate, setDebate] = useState(initialDebate);
	const [participants, setParticipants] = useState(initialParticipants);
	const [args, setArgs] = useState(initialArguments);
	const [connectionState, setConnectionState] =
		useState<ConnectionState>("paused");
	const [userVotes, setUserVotes] = useState<Set<string>>(() =>
		loadUserVotes(initialDebate.id),
	);

	const argsRef = useRef(args);
	argsRef.current = args;

	const participant = participants.find((p) => p.userId === currentUserId);

	// ── Realtime subscription ────────────────────────────────────────
	useEffect(() => {
		let supabase;
		try {
			supabase = createSupabaseBrowserClient();
		} catch {
			// No env vars — skip realtime
			return;
		}

		const argIds = new Set(argsRef.current.map((a) => a.id));

		const channel = createDebateChannel(debate.id, supabase, {
			onArgument: (arg) => {
				setArgs((prev) => {
					if (prev.some((a) => a.id === arg.id)) return prev;
					return [...prev, arg];
				});
			},
			onVote: ({ argumentId, vote }) => {
				// Only process votes for arguments in this debate
				if (!argIds.has(argumentId)) return;

				const delta = vote === "strong" ? 1 : -1;
				setArgs((prev) =>
					prev.map((a) =>
						a.id === argumentId
							? { ...a, netVoteScore: a.netVoteScore + delta }
							: a,
					),
				);
			},
		});

		channel.onStateChange(setConnectionState);
		channel.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [debate.id]);

	// ── Refresh (full resync) ────────────────────────────────────────
	const refreshDebate = useCallback(async () => {
		try {
			const res = await fetch(`/api/debates/${debate.id}`);
			if (!res.ok) return;
			const data = await res.json();
			setDebate(data.debate);
			setParticipants(data.participants);
			setArgs(flattenTree(data.tree));
		} catch {
			// silently fail — will retry on next action
		}
	}, [debate.id]);

	// ── Conclusion flow ──────────────────────────────────────────────
	const proposeConclusion = useCallback(async () => {
		try {
			const res = await fetch(`/api/debates/${debate.id}/conclusion`, {
				method: "POST",
			});
			if (res.ok) {
				const data = await res.json();
				setDebate(data.debate);
			}
		} catch {
			// silently fail
		}
	}, [debate.id]);

	const respondToConclusion = useCallback(
		async (action: "accept" | "decline") => {
			try {
				const res = await fetch(`/api/debates/${debate.id}/conclusion`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action }),
				});
				if (res.ok) {
					const data = await res.json();
					setDebate(data.debate);
				}
			} catch {
				// silently fail
			}
		},
		[debate.id],
	);

	// ── Cast vote (optimistic) ───────────────────────────────────────
	const castVote = useCallback(
		async (argumentId: string, vote: VoteValue) => {
			if (userVotes.has(argumentId)) return;

			// Optimistic update
			const delta = vote === "strong" ? 1 : -1;
			const nextVotes = new Set(userVotes);
			nextVotes.add(argumentId);
			setUserVotes(nextVotes);
			saveUserVotes(debate.id, nextVotes);

			setArgs((prev) =>
				prev.map((a) =>
					a.id === argumentId
						? { ...a, netVoteScore: a.netVoteScore + delta }
						: a,
				),
			);

			try {
				const res = await fetch("/api/votes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ argumentId, vote }),
				});

				if (!res.ok) {
					// Revert optimistic update
					const reverted = new Set(userVotes);
					setUserVotes(reverted);
					saveUserVotes(debate.id, reverted);

					setArgs((prev) =>
						prev.map((a) =>
							a.id === argumentId
								? {
										...a,
										netVoteScore: a.netVoteScore - delta,
									}
								: a,
						),
					);
				}
			} catch {
				// Revert on network error
				const reverted = new Set(userVotes);
				setUserVotes(reverted);
				saveUserVotes(debate.id, reverted);

				setArgs((prev) =>
					prev.map((a) =>
						a.id === argumentId
							? { ...a, netVoteScore: a.netVoteScore - delta }
							: a,
					),
				);
			}
		},
		[debate.id, userVotes],
	);

	return (
		<DebateContext.Provider
			value={{
				debate,
				participants,
				arguments: args,
				currentUserId,
				isParticipant: !!participant,
				userSide: participant?.side ?? null,
				connectionState,
				userVotes,
				refreshDebate,
				castVote,
				proposeConclusion,
				respondToConclusion,
			}}
		>
			{children}
		</DebateContext.Provider>
	);
}

/** Flatten a nested argument tree into a flat array */
function flattenTree(tree: Argument[]): Argument[] {
	const result: Argument[] = [];
	function walk(nodes: Argument[]) {
		for (const node of nodes) {
			result.push(node);
			if (node.children) walk(node.children);
		}
	}
	walk(tree);
	return result;
}
