import { chromium } from "playwright";
import { STORAGE_STATE_PATH, dismissCookieBanner } from "../src/auth.js";
import { isOnWishlist } from "../src/wishlist.js";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  // Simulate scrape loop: visit another deal first, then FxChain quickly (like enrichDealsWithWishlist)
  const other = "https://assetstore.unity.com/packages/package/212735";
  const fx = "https://assetstore.unity.com/packages/package/316031";

  for (const [label, url] of [
    ["other", other],
    ["fx-immediate", fx],
  ] as const) {
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await dismissCookieBanner(page);
    const samples: Array<{ ms: number; state: unknown; cls: string }> = [];

    for (let i = 0; i < 20; i++) {
      const snap = await page.evaluate(`(() => {
        const btns = [...document.querySelectorAll('[data-test="saved-list-icon"]')];
        const btn = btns[0];
        if (!btn) return { count: 0, cls: "", state: null };
        const icon = btn.querySelector(".ifont");
        const cls = icon ? icon.className : "";
        let state = null;
        if (btn.querySelector(".ifont-favorite-border")) state = false;
        else if (btn.querySelector(".ifont-favorite")) state = true;
        return { count: btns.length, cls, state };
      })()`);
      samples.push({ ms: Date.now() - t0, state: snap.state, cls: snap.cls });
      await page.waitForTimeout(250);
    }

    const detected = await isOnWishlist(page);
    console.log(`\\n=== ${label} isOnWishlist=${detected} ===`);
    console.log(samples.map((s) => `${s.ms}ms state=${s.state} cls=${s.cls}`).join("\\n"));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
