import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	use: {
		baseURL: "https://premise-debate.vercel.app",
		headless: true,
		// The deployed app uses a per-request CSP nonce that blocks inline scripts
		// in headless browsers (Next.js RSC payload scripts lack nonce attributes).
		// bypassCSP allows React hydration so tests can interact with real DOM state.
		bypassCSP: true,
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
