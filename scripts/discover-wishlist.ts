import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { STORAGE_STATE_PATH } from "../src/auth.js";

const URLS = {
  onWishlist:
    "https://assetstore.unity.com/packages/tools/animation/fxchain-v2-procedural-animation-sequencing-for-unity-316031",
  notWishlist: "https://assetstore.unity.com/packages/package/331249",
};

async function inspect(page: import("playwright").Page, label: string, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(5000);

  await page
    .waitForSelector(
      '[data-test*="wishlist" i], [aria-label*="wishlist" i], [aria-label*="wish list" i]',
      { timeout: 30_000 }
    )
    .catch(() => undefined);

  const info = await page.evaluate(`(() => {
    const hearts = [...document.querySelectorAll("button, a, [role='button'], svg")].filter((el) => {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const test = (el.getAttribute("data-test") || "").toLowerCase();
      const cls = String(el.className && el.className.baseVal ? el.className.baseVal : el.className || "").toLowerCase();
      const href = (el.getAttribute("href") || "").toLowerCase();
      return (
        aria.includes("wishlist") ||
        aria.includes("wish list") ||
        aria.includes("favorite") ||
        test.includes("wishlist") ||
        test.includes("favourite") ||
        test.includes("favorite") ||
        cls.includes("wishlist") ||
        href.includes("wishlist")
      );
    });

    const heartInfo = hearts.slice(0, 20).map((el) => {
      const svg = el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg");
      const path = svg ? svg.querySelector("path") : null;
      const cls = el.className && el.className.baseVal ? el.className.baseVal : el.className;
      return {
        tag: el.tagName,
        aria: el.getAttribute("aria-label"),
        ariaPressed: el.getAttribute("aria-pressed"),
        title: el.getAttribute("title"),
        dataTest: el.getAttribute("data-test"),
        className: String(cls || "").slice(0, 200),
        text: (el.textContent || "").trim().slice(0, 80),
        svgClass: svg ? String(svg.getAttribute("class") || "").slice(0, 200) : null,
        svgFill: svg ? svg.getAttribute("fill") : null,
        pathFill: path ? path.getAttribute("fill") : null,
        pathD: path ? (path.getAttribute("d") || "").slice(0, 120) : null,
        outer: el.outerHTML.slice(0, 900),
      };
    });

    const dataTests = [...document.querySelectorAll("[data-test]")]
      .map((el) => el.getAttribute("data-test"))
      .filter((t) => /wish|fav|heart|save/i.test(t || ""));

    return {
      url: location.href,
      title: document.title,
      dataTests: [...new Set(dataTests)],
      heartInfo,
    };
  })()`);

  writeFileSync(`discovery-wishlist-${label}.json`, JSON.stringify(info, null, 2));
  console.log(`\\n=== ${label} ===`);
  console.log(JSON.stringify(info, null, 2));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  await inspect(page, "on", URLS.onWishlist);
  await inspect(page, "off", URLS.notWishlist);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
