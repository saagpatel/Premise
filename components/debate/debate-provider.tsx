"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Argument, Debate, DebateSide, Participant } from "@/types";

interface DebateContextValue {
	debate: Debate;
	participants: Participant[];
	arguments: Argument[];
	currentUserId: string | null;
	isParticipant: boolean;
	userSide: DebateSide | null;
	refreshDebate: () => Promise<void>;
}

const DebateContext = createContext<DebateContextValue | null>(null);

export function useDebate(): DebateContextValue {
	const ctx = useContext(DebateContext);
	if (!ctx) throw new Error("useDebate must be used within DebateProvider");
	return ctx;
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

	const participant = participants.find((p) => p.userId === currentUserId);

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

	return (
		<DebateContext.Provider
			value={{
				debate,
				participants,
				arguments: args,
				currentUserId,
				isParticipant: !!participant,
				userSide: participant?.side ?? null,
				refreshDebate,
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
