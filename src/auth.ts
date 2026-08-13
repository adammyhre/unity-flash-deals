import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE_PATH = resolve(__dirname, "..", "storage-state.json");

const PROFILE_MENU_SIGNED_OUT = '[data-test="signed-out-profile-menu-toggle"]';
const PROFILE_MENU_SIGNED_IN = '[data-test="signed-in-profile-menu-toggle"]';
const USER_MENU_ITEM = '[data-test="user-menu-item"]';

export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.locator("#onetrust-accept-btn-handler");
  if (await accept.isVisible().catch(() => false)) {
    await accept.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

export async function isSignedIn(page: Page): Promise<boolean> {
  if (await page.locator(PROFILE_MENU_SIGNED_IN).count()) return true;
  if (await page.locator(PROFILE_MENU_SIGNED_OUT).count()) return false;

  // Fallback: any profile toggle that isn't the signed-out one.
  const toggles = page.locator(
    '[data-test*="profile-menu-toggle"], [aria-label*="profile menu" i], [aria-label*="user menu" i]'
  );
  const count = await toggles.count();
  if (count === 0) return false;
  const dataTest = await toggles.first().getAttribute("data-test");
  return dataTest !== "signed-out-profile-menu-toggle";
}

export async function signIn(
  page: Page,
  credentials: { email: string; password: string }
): Promise<void> {
  if (!credentials.email || !credentials.password) {
    throw new Error("Missing email/password in config.json");
  }
  if (credentials.email.includes("example.com")) {
    throw new Error("Replace placeholder credentials in config.json before signing in");
  }

  console.log("Signing in...");
  await page.goto("https://assetstore.unity.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);
  await dismissCookieBanner(page);

  if (await isSignedIn(page)) {
    console.log("Already signed in.");
    return;
  }

  await page.locator(PROFILE_MENU_SIGNED_OUT).click();
  await page.locator(USER_MENU_ITEM, { hasText: "Sign In" }).click();

  await page.waitForURL(/login\.unity\.com/i, { timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
  await dismissCookieBanner(page);

  const emailInput = page.locator('input[name="email"], #email');
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(credentials.email);

  await page.getByRole("button", { name: /^continue$/i }).click();

  const passwordInput = page.locator(
    '[data-test="password-input"], input[type="password"], input[name="password"]'
  );
  await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  await passwordInput.fill(credentials.password);

  await Promise.all([
    page.waitForURL(/assetstore\.unity\.com/i, { timeout: 90_000 }),
    page.getByRole("button", { name: /^sign in$/i }).click(),
  ]);

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  await dismissCookieBanner(page);

  if (!(await isSignedIn(page))) {
    // Sometimes redirect lands before header hydrates.
    await page.waitForTimeout(3000);
  }

  if (!(await isSignedIn(page))) {
    throw new Error("Sign-in completed but Asset Store still looks signed out");
  }

  console.log("Signed in successfully.");
}

export async function persistStorageState(context: BrowserContext): Promise<void> {
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);
}

export function hasStoredSession(): boolean {
  return existsSync(STORAGE_STATE_PATH);
}
