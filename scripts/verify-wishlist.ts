import { chromium } from "playwright";
import { STORAGE_STATE_PATH, dismissCookieBanner } from "../src/auth.js";
import { isOnWishlist } from "../src/wishlist.js";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  const cases = [
    ["edgar (expected no)", "https://assetstore.unity.com/packages/package/212735", false],
    ["fxchain (expected yes)", "https://assetstore.unity.com/packages/package/316031", true],
    ["boxcutter (expected no)", "https://assetstore.unity.com/packages/package/331249", false],
  ] as const;

  for (const [label, url, expected] of cases) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await dismissCookieBanner(page);
    const t0 = Date.now();
    const result = await isOnWishlist(page);
    const ok = result === expected ? "OK" : "FAIL";
    console.log(`${ok} ${label}: got=${result} in ${Date.now() - t0}ms`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
