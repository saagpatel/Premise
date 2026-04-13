import { type NextRequest, NextResponse } from "next/server";
import { classifyArgument } from "@/lib/classify";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
	const ip =
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		request.headers.get("x-real-ip") ??
		"unknown";

	const { allowed, retryAfterMs } = checkRateLimit(ip);
	if (!allowed) {
		return NextResponse.json(
			{ error: "Rate limit exceeded" },
			{
				status: 429,
				headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
			},
		);
	}

	let body: { contentText?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (typeof body.contentText !== "string" || !body.contentText.trim()) {
		return NextResponse.json(
			{ error: "contentText is required" },
			{ status: 400 },
		);
	}

	const result = await classifyArgument(body.contentText);
	return NextResponse.json(result);
}
