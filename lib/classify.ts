import type { ArgumentType, ClassifyResponse } from "@/types";

const VALID_ARGUMENT_TYPES: ReadonlySet<ArgumentType> = new Set([
	"evidence",
	"analogy",
	"counterexample",
	"reductio",
	"authority",
	"concession",
	"clarification",
]);

const SYSTEM_PROMPT =
	'You are an argument classifier. Given an argument text, identify which of these 7 types it is: evidence, analogy, counterexample, reductio, authority, concession, clarification. Definitions: evidence=empirical fact/data; analogy=comparison to similar situation; counterexample=specific case contradicting a claim; reductio=showing opponent\'s logic leads to absurdity; authority=citing an expert/institution; concession=acknowledging opponent\'s valid point; clarification=asking for or providing definition. Return ONLY valid JSON: { "suggestedType": string, "confidence": number, "reasoning": string }.';

const NULL_RESPONSE: ClassifyResponse = {
	suggestedType: null,
	confidence: 0,
	reasoning: "",
};

const FAILED_RESPONSE: ClassifyResponse = {
	suggestedType: null,
	confidence: 0,
	reasoning: "Classification failed",
};

// Ollama endpoint — defaults to localhost, configurable via env
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b";

async function classifyViaOllama(
	contentText: string,
): Promise<ClassifyResponse> {
	const res = await fetch(`${OLLAMA_URL}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: OLLAMA_MODEL,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: contentText },
			],
			format: "json",
			stream: false,
		}),
	});

	if (!res.ok) {
		console.error("classify: Ollama returned", res.status);
		return FAILED_RESPONSE;
	}

	const json: unknown = await res.json();
	if (typeof json !== "object" || json === null || !("message" in json)) {
		return FAILED_RESPONSE;
	}

	const message = (json as Record<string, unknown>).message;
	if (
		typeof message !== "object" ||
		message === null ||
		!("content" in message)
	) {
		return FAILED_RESPONSE;
	}

	return parseClassifyResponse(
		(message as Record<string, unknown>).content as string,
	);
}

async function classifyViaAnthropic(
	contentText: string,
): Promise<ClassifyResponse> {
	const { default: Anthropic } = await import("@anthropic-ai/sdk");
	const client = new Anthropic();

	const message = await client.messages.create({
		model: "claude-haiku-4-5-20251001",
		max_tokens: 256,
		system: SYSTEM_PROMPT,
		messages: [{ role: "user", content: contentText }],
	});

	const block = message.content[0];
	if (!block || block.type !== "text") {
		return FAILED_RESPONSE;
	}

	return parseClassifyResponse(block.text);
}

function parseClassifyResponse(text: string): ClassifyResponse {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		console.error("classify: failed to parse JSON response:", text);
		return FAILED_RESPONSE;
	}

	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("suggestedType" in parsed) ||
		!("confidence" in parsed) ||
		!("reasoning" in parsed)
	) {
		console.error("classify: unexpected response shape:", parsed);
		return FAILED_RESPONSE;
	}

	const { suggestedType, confidence, reasoning } = parsed as Record<
		string,
		unknown
	>;

	if (
		typeof suggestedType !== "string" ||
		!VALID_ARGUMENT_TYPES.has(suggestedType as ArgumentType)
	) {
		console.error("classify: invalid suggestedType:", suggestedType);
		return FAILED_RESPONSE;
	}

	return {
		suggestedType: suggestedType as ArgumentType,
		confidence: typeof confidence === "number" ? confidence : 0,
		reasoning: typeof reasoning === "string" ? reasoning : "",
	};
}

/**
 * Classify an argument using the best available provider:
 * 1. Anthropic API (if ANTHROPIC_API_KEY is set)
 * 2. Ollama local model (if running on localhost)
 * 3. Null response (graceful degrade — no classifier available)
 */
export async function classifyArgument(
	contentText: string,
): Promise<ClassifyResponse> {
	// Prefer Anthropic if key is available
	if (process.env.ANTHROPIC_API_KEY) {
		try {
			return await classifyViaAnthropic(contentText);
		} catch (err) {
			console.error("classify: Anthropic error, falling back:", err);
		}
	}

	// Fall back to Ollama
	try {
		return await classifyViaOllama(contentText);
	} catch (err) {
		console.error("classify: Ollama unavailable:", err);
	}

	return NULL_RESPONSE;
}
