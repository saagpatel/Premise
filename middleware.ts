import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
	const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
	let supabaseConnectSrc = "";
	if (supabaseUrl) {
		try {
			// Use `host` (includes any explicit port) and keep the URL's own scheme.
			// `hostname` drops the port, so a self-hosted or local Supabase on e.g.
			// :54321 produced `wss://127.0.0.1`, which never matches
			// `ws://127.0.0.1:54321` — realtime was silently blocked by CSP while
			// the page otherwise looked healthy. Hosted projects are on the default
			// port over https, which is why this only bit non-default-port setups.
			const { host, protocol } = new URL(supabaseUrl);
			const isSecure = protocol === "https:";
			const httpOrigin = `${isSecure ? "https" : "http"}://${host}`;
			const wsOrigin = `${isSecure ? "wss" : "ws"}://${host}`;
			supabaseConnectSrc = `${httpOrigin} ${wsOrigin}`;
		} catch {
			// invalid URL, skip
		}
	}

	// Next's development runtime evaluates modules via eval(). Without this the
	// dev server still renders, but any chunk that needs eval silently fails to
	// initialise — which took out the realtime subscription while the page
	// otherwise looked fine. Production builds need no eval, so the relaxation
	// is strictly scoped to development.
	const evalSrc = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

	const csp = [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalSrc}`,
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
