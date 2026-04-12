import Anthropic from "@anthropic-ai/sdk";
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

export async function classifyArgument(
	contentText: string,
): Promise<ClassifyResponse> {
	if (!process.env.ANTHROPIC_API_KEY) {
		return NULL_RESPONSE;
	}

	try {
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

		let parsed: unknown;
		try {
			parsed = JSON.parse(block.text);
		} catch {
			console.error("classify: failed to parse JSON response:", block.text);
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
	} catch (err) {
		console.error("classify: unexpected error:", err);
		return NULL_RESPONSE;
	}
}
