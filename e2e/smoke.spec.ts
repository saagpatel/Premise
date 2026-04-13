import { expect, test } from "@playwright/test";

test("homepage loads with correct title", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("domcontentloaded");
	// Title is present in static HTML; wait up to 10s for it to be set
	await expect(page).toHaveTitle(/Premise/, { timeout: 10_000 });
});

test("start debate form is visible", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("domcontentloaded");
	// The homepage has a "Start Debate" submit button in the claim form
	const button = page.getByRole("button", { name: /start debate/i });
	await expect(button).toBeVisible({ timeout: 10_000 });
});

test("sign-in page loads", async ({ page }) => {
	await page.goto("/sign-in");
	await page.waitForLoadState("domcontentloaded");
	await expect(page).toHaveTitle(/Premise/, { timeout: 10_000 });
	// "Sign in to Premise" heading is in the static HTML
	await expect(
		page.getByRole("heading", { name: /sign in to premise/i }),
	).toBeVisible({ timeout: 10_000 });
});
