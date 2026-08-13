import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";

async function dumpInputs(page: import("playwright").Page, label: string) {
  await page.waitForTimeout(2000);
  const info = await page.evaluate(`(() => ({
    url: location.href,
    title: document.title,
    headings: [...document.querySelectorAll("h1,h2,h3,label")].map((el) => ({
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 120),
      for: el.getAttribute("for"),
    })).slice(0, 40),
    inputs: [...document.querySelectorAll("input, button, [role='button']")].map((el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.id,
      aria: el.getAttribute("aria-label"),
      placeholder: el.getAttribute("placeholder"),
      dataTest: el.getAttribute("data-test") || el.getAttribute("data-testid"),
      value: el.tagName === "INPUT" ? "" : (el.textContent || "").trim().slice(0, 80),
      className: String(el.className).slice(0, 100),
    })).slice(0, 60),
  }))()`);
  writeFileSync(`discovery-auth-${label}.json`, JSON.stringify(info, null, 2));
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(info, null, 2));
  return info;
}

async function main() {
  const config = loadConfig([]);
  if (!config.email || config.email.includes("example.com")) {
    throw new Error("Set real credentials in config.json first");
  }

  const browser = await chromium.launch({ headless: true, slowMo: 50 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  await page.goto("https://assetstore.unity.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(3000);

  await page.locator('[data-test="signed-out-profile-menu-toggle"]').click();
  await page.waitForTimeout(500);

  await Promise.all([
    page.waitForURL(/id\.unity\.com|login|signin|auth/i, { timeout: 60_000 }).catch(() => null),
    page.locator('[data-test="user-menu-item"]', { hasText: "Sign In" }).click(),
  ]);

  await page.waitForLoadState("domcontentloaded");
  await dumpInputs(page, "email-step");

  // Fill email / username
  const emailInput = page.locator(
    'input[type="email"], input[name="username"], input[name="email"], input[id*="email" i], input[id*="user" i]'
  ).first();
  await emailInput.waitFor({ timeout: 30_000 });
  await emailInput.fill(config.email);

  // Continue / Next / Submit
  const continueBtn = page.getByRole("button", { name: /continue|next|sign in|log in/i }).first();
  await continueBtn.click();
  await page.waitForTimeout(4000);
  await dumpInputs(page, "password-step");

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor({ timeout: 30_000 });
  await passwordInput.fill(config.password);

  const submitBtn = page.getByRole("button", { name: /sign in|log in|continue|next|submit/i }).first();
  await Promise.all([
    page.waitForURL(/assetstore\.unity\.com/i, { timeout: 90_000 }).catch(() => null),
    submitBtn.click(),
  ]);

  await page.waitForTimeout(5000);
  await dumpInputs(page, "after-login");

  const signedIn = await page.locator('[data-test="signed-out-profile-menu-toggle"]').count();
  const signedInToggle = await page.locator('[data-test*="profile-menu"], [data-test*="signed-in"]').count();
  console.log({ signedOutTogglePresent: signedIn > 0, profileMenuMatches: signedInToggle, url: page.url() });

  await context.storageState({ path: "storage-state.json" });
  console.log("Wrote storage-state.json");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
