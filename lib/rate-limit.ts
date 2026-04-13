const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const ipTimestamps = new Map<string, number[]>();

export function checkRateLimit(ip: string): {
	allowed: boolean;
	retryAfterMs: number;
} {
	const now = Date.now();
	const windowStart = now - WINDOW_MS;
	const timestamps = (ipTimestamps.get(ip) ?? []).filter(
		(t) => t > windowStart,
	);

	if (timestamps.length >= MAX_REQUESTS) {
		const retryAfterMs = timestamps[0]! + WINDOW_MS - now;
		return { allowed: false, retryAfterMs };
	}

	timestamps.push(now);
	ipTimestamps.set(ip, timestamps);
	return { allowed: true, retryAfterMs: 0 };
}
