import { NextResponse } from "next/server";
import { getAnonId, resolveUserId } from "@/lib/anon-identity";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { FlagReason } from "@/types";

const VALID_FLAG_REASONS: ReadonlySet<FlagReason> = new Set([
	"bad_faith",
	"personal_attack",
	"off_topic",
	"spam",
	"other",
]);

export async function POST(request: Request) {
	const anonId = await getAnonId();
	if (!anonId) {
		return NextResponse.json(
			{ error: "Anonymous identity required" },
			{ status: 401 },
		);
	}

	const supabase = createServiceRoleClient();
	const userId = await resolveUserId(supabase);
	if (!userId) {
		return NextResponse.json({ error: "User not found" }, { status: 401 });
	}

	let body: { argumentId?: unknown; reason?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (typeof body.argumentId !== "string" || !body.argumentId) {
		return NextResponse.json(
			{ error: "argumentId is required" },
			{ status: 400 },
		);
	}
	const argumentId = body.argumentId;

	if (
		typeof body.reason !== "string" ||
		!VALID_FLAG_REASONS.has(body.reason as FlagReason)
	) {
		return NextResponse.json(
			{
				error:
					"reason must be one of: bad_faith, personal_attack, off_topic, spam, other",
			},
			{ status: 400 },
		);
	}
	const reason = body.reason as FlagReason;

	try {
		// Fetch argument to verify it exists and get author_id
		const { data: argument, error: argumentError } = await supabase
			.from("arguments")
			.select("id, author_id")
			.eq("id", argumentId)
			.single();

		if (argumentError || !argument) {
			return NextResponse.json(
				{ error: "Argument not found" },
				{ status: 404 },
			);
		}

		if (argument.author_id === userId) {
			return NextResponse.json(
				{ error: "Cannot flag your own argument" },
				{ status: 403 },
			);
		}

		// Insert flag
		const { error: insertError } = await supabase.from("flags").insert({
			argument_id: argumentId,
			flagger_id: userId,
			reason,
		});

		if (insertError) {
			if (insertError.code === "23505") {
				return NextResponse.json(
					{ error: "Already flagged this argument" },
					{ status: 409 },
				);
			}
			console.error("Failed to insert flag:", insertError.message);
			return NextResponse.json(
				{ error: "Failed to submit flag" },
				{ status: 500 },
			);
		}

		// Atomically increment flag_count via DB function — avoids read-modify-write races.
		const { data: flagCount, error: rpcError } = await supabase.rpc(
			"increment_flag_count",
			{ arg_id: argumentId },
		);

		if (rpcError) {
			console.error("Failed to update flag_count:", rpcError.message);
			return NextResponse.json(
				{ error: "Flag recorded but count update failed" },
				{ status: 500 },
			);
		}

		return NextResponse.json({ argumentId, flagCount }, { status: 201 });
	} catch (err) {
		console.error("Unexpected error submitting flag:", err);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
