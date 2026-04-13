import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
	const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
	let supabaseConnectSrc = "";
	if (supabaseUrl) {
		try {
			const hostname = new URL(supabaseUrl).hostname;
			supabaseConnectSrc = `https://${hostname} wss://${hostname}`;
		} catch {
			// invalid URL, skip
		}
	}

	const csp = [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		`connect-src 'self' ${supabaseConnectSrc}`.trim(),
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; ");

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-nonce", nonce);
	requestHeaders.set("content-security-policy", csp);

	const response = NextResponse.next({
		request: { headers: requestHeaders },
	});

	response.headers.set("content-security-policy", csp);
	response.headers.set("x-content-type-options", "nosniff");
	response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
	response.headers.set(
		"permissions-policy",
		"camera=(), microphone=(), geolocation=()",
	);
	response.headers.set("x-dns-prefetch-control", "off");

	return response;
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
