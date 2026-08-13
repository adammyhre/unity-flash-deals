import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { STORAGE_STATE_PATH, dismissCookieBanner } from "../src/auth.js";
import { isOnWishlist } from "../src/wishlist.js";

const URLS = {
  on: "https://assetstore.unity.com/packages/tools/animation/fxchain-v2-procedural-animation-sequencing-for-unity-316031",
  // short package URL form used by listing cards:
  onShort: "https://assetstore.unity.com/packages/package/316031",
  off: "https://assetstore.unity.com/packages/package/331249",
};

async function dump(page: import("playwright").Page, label: string, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4000);
  await dismissCookieBanner(page);
  await page.waitForTimeout(2000);

  const detected = await isOnWishlist(page);

  const info = await page.evaluate(`(() => {
    const btn = document.querySelector('[data-test="saved-list-icon"]');
    const allFav = [...document.querySelectorAll("[class*='favorite'], [class*='wish'], [data-test*='wish'], [data-test*='saved'], [data-test*='favorite']")].map((el) => ({
      tag: el.tagName,
      dataTest: el.getAttribute("data-test"),
      aria: el.getAttribute("aria-label"),
      ariaPressed: el.getAttribute("aria-pressed"),
      title: el.getAttribute("title"),
      className: String(el.className || "").slice(0, 250),
      outer: el.outerHTML.slice(0, 500),
    }));

    let btnDetail = null;
    if (btn) {
      const icons = [...btn.querySelectorAll(".ifont, i, svg, span, div")].map((el) => ({
        tag: el.tagName,
        className: String(el.className || ""),
        outer: el.outerHTML.slice(0, 300),
      }));
      btnDetail = {
        aria: btn.getAttribute("aria-label"),
        ariaPressed: btn.getAttribute("aria-pressed"),
        className: String(btn.className || ""),
        outer: btn.outerHTML.slice(0, 1200),
        icons,
        hasFavoriteBorder: !!btn.querySelector(".ifont-favorite-border"),
        hasFavorite: !!btn.querySelector(".ifont-favorite"),
        hasFavoriteNotBorder: !!btn.querySelector(".ifont-favorite:not(.ifont-favorite-border)"),
      };
    }

    return {
      url: location.href,
      title: document.title,
      btnDetail,
      allFav: allFav.slice(0, 40),
    };
  })()`);

  writeFileSync(`discovery-wishfix-${label}.json`, JSON.stringify({ detected, ...info }, null, 2));
  console.log(`\\n=== ${label} detected=${detected} url=${info.url} ===`);
  console.log(JSON.stringify({ detected, btnDetail: info.btnDetail }, null, 2));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  await dump(page, "on-long", URLS.on);
  await dump(page, "on-short", URLS.onShort);
  await dump(page, "off", URLS.off);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
