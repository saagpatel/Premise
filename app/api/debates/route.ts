import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CreateDebateResponse, DebateStatus } from "@/types";

const VALID_VISIBILITY = ["public", "private"] as const;

export interface DebateFeedItem {
	id: string;
	claimText: string;
	status: DebateStatus;
	lastActivityAt: string;
	createdAt: string;
	participantCount: number;
	argumentCount: number;
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const cursor = searchParams.get("cursor");
	const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
	const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

	const supabase = createServiceRoleClient();

	try {
		let query = supabase
			.from("debates")
			.select(
				"id, claim_text, status, last_activity_at, created_at, participants(count), arguments(count)",
			)
			.eq("visibility", "public")
			.neq("status", "stalled")
			.order("last_activity_at", { ascending: false })
			.limit(limit + 1);

		if (cursor) {
			query = query.lt("last_activity_at", cursor);
		}

		const { data, error } = await query;

		if (error) {
			console.error("Failed to fetch debates feed:", error.message);
			return NextResponse.json(
				{ error: "Failed to fetch debates" },
				{ status: 500 },
			);
		}

		const rows = (data ?? []) as Array<{
			id: string;
			claim_text: string;
			status: DebateStatus;
			last_activity_at: string;
			created_at: string;
			participants: Array<{ count: number }>;
			arguments: Array<{ count: number }>;
		}>;

		const hasMore = rows.length > limit;
		const sliced = rows.slice(0, limit);

		const debates: DebateFeedItem[] = sliced.map((row) => ({
			id: row.id,
			claimText: row.claim_text,
			status: row.status,
			lastActivityAt: row.last_activity_at,
			createdAt: row.created_at,
			participantCount: row.participants[0]?.count ?? 0,
			argumentCount: row.arguments[0]?.count ?? 0,
		}));

		const nextCursor = hasMore
			? (sliced[sliced.length - 1]?.last_activity_at ?? null)
			: null;

		return NextResponse.json({
			debates,
			meta: { nextCursor, hasMore },
		});
	} catch (err) {
		console.error("Unexpected error fetching debates feed:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const anonId = getAnonId();
	if (!anonId) {
		return NextResponse.json(
			{
				error: "Anonymous identity required. Call GET /api/auth/anon-id first.",
			},
			{ status: 401 },
		);
	}

	const supabase = createServiceRoleClient();
	const userId = await resolveUserId(supabase);
	if (!userId) {
		return NextResponse.json(
			{ error: "User not found for anonymous identity" },
			{ status: 401 },
		);
	}

	let body: { claimText?: unknown; visibility?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	// Validate claimText
	if (typeof body.claimText !== "string") {
		return NextResponse.json(
			{ error: "claimText must be a string" },
			{ status: 400 },
		);
	}
	const claimText = body.claimText.trim();
	if (claimText.length < 1 || claimText.length > 280) {
		return NextResponse.json(
			{ error: "claimText must be between 1 and 280 characters" },
			{ status: 400 },
		);
	}

	// Validate visibility
	if (
		!VALID_VISIBILITY.includes(
			body.visibility as (typeof VALID_VISIBILITY)[number],
		)
	) {
		return NextResponse.json(
			{ error: "visibility must be 'public' or 'private'" },
			{ status: 400 },
		);
	}
	const visibility = body.visibility as "public" | "private";

	try {
		// Create debate
		const { data: debate, error: debateError } = await supabase
			.from("debates")
			.insert({
				claim_text: claimText,
				creator_id: userId,
				status: "open",
				visibility,
			})
			.select("id")
			.single();

		if (debateError || !debate) {
			console.error("Failed to create debate:", debateError?.message);
			return NextResponse.json(
				{ error: "Failed to create debate" },
				{ status: 500 },
			);
		}

		// Add creator as "for" participant
		const { error: participantError } = await supabase
			.from("participants")
			.insert({
				debate_id: debate.id,
				user_id: userId,
				side: "for",
			});

		if (participantError) {
			console.error("Failed to add participant:", participantError.message);
			// Clean up the debate
			await supabase.from("debates").delete().eq("id", debate.id);
			return NextResponse.json(
				{ error: "Failed to create debate" },
				{ status: 500 },
			);
		}

		const response: CreateDebateResponse = {
			id: debate.id,
			inviteUrl: `/d/${debate.id}?join=against`,
		};

		return NextResponse.json(response, { status: 201 });
	} catch (err) {
		console.error("Unexpected error creating debate:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
