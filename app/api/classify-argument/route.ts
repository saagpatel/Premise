import { NextResponse } from "next/server";
import { classifyArgument } from "@/lib/classify";

export async function POST(request: Request) {
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
