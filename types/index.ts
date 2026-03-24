import type * as d3 from "d3";

// ── Union types ──────────────────────────────────────────────────────

export type DebateStatus =
	| "open"
	| "in_progress"
	| "concluding"
	| "concluded"
	| "stalled";

export type DebateSide = "for" | "against";

export type ArgumentType =
	| "evidence"
	| "analogy"
	| "counterexample"
	| "reductio"
	| "authority"
	| "concession"
	| "clarification";

export type VoteValue = "strong" | "weak";

export type FlagReason =
	| "bad_faith"
	| "personal_attack"
	| "off_topic"
	| "spam"
	| "other";

// ── Domain models ────────────────────────────────────────────────────

export interface User {
	id: string;
	authId: string | null;
	anonId: string | null;
	username: string | null;
	displayName: string | null;
	debatesParticipated: number;
	createdAt: string;
}

export interface Debate {
	id: string;
	claimText: string;
	creatorId: string;
	status: DebateStatus;
	visibility: "public" | "private";
	conclusionProposedBy: string | null;
	conclusionProposedAt: string | null;
	lastActivityAt: string;
	createdAt: string;
	participants?: Participant[];
	argumentCount?: number;
}

export interface Participant {
	id: string;
	debateId: string;
	userId: string;
	side: DebateSide;
	joinedAt: string;
	user?: User;
}

export interface Argument {
	id: string;
	debateId: string;
	authorId: string;
	parentArgumentId: string | null;
	argumentType: ArgumentType;
	contentText: string;
	side: DebateSide;
	netVoteScore: number;
	flagCount: number;
	createdAt: string;
	children?: Argument[];
}

export interface Vote {
	id: string;
	argumentId: string;
	voterId: string;
	vote: VoteValue;
	createdAt: string;
}

export interface Invitation {
	id: string;
	debateId: string;
	inviteToken: string;
	invitedSide: DebateSide | null;
	createdAt: string;
	acceptedAt: string | null;
}

export interface Flag {
	id: string;
	argumentId: string;
	flaggerId: string;
	reason: FlagReason;
	createdAt: string;
}

// ── D3 tree node ─────────────────────────────────────────────────────

export interface ArgumentTreeNode extends d3.HierarchyPointNode<Argument> {
	data: Argument;
	strokeWidth: number; // 2 + Math.max(0, netVoteScore) * 0.5, capped at 8
	isHighlighted: boolean; // true if identified as crux node
	isDisputed: boolean; // true if flagCount >= 5
}

// ── AI classifier ────────────────────────────────────────────────────

export interface ClassifyResponse {
	suggestedType: ArgumentType | null; // null if ANTHROPIC_API_KEY unset
	confidence: number;
	reasoning: string;
}

// ── Health check ─────────────────────────────────────────────────────

export interface HealthCheckResult {
	tablesExist: boolean;
	realtimeEnabled: boolean;
	rlsEnabled: boolean;
	missingTables: string[];
	errors: string[];
}

// ── API request/response shapes ──────────────────────────────────────

export interface CreateDebateRequest {
	claimText: string;
	visibility: "public" | "private";
}

export interface CreateDebateResponse {
	id: string;
	inviteUrl: string; // /d/[id]?join=against
}

export interface PostArgumentRequest {
	debateId: string;
	parentArgumentId: string | null;
	argumentType: ArgumentType;
	contentText: string;
}

export interface CastVoteRequest {
	argumentId: string;
	vote: VoteValue;
}
