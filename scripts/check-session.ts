import { chromium } from "playwright";
import { STORAGE_STATE_PATH } from "../src/auth.js";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();
  await page.goto("https://assetstore.unity.com/listing#f-ec_sale_filters=on_sale,flash_deal", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);

  const info = await page.evaluate(`(() => {
    const profile = [...document.querySelectorAll("[data-test*='profile'], [aria-label*='profile' i], [aria-label*='user' i]")].map((el) => ({
      dataTest: el.getAttribute("data-test"),
      aria: el.getAttribute("aria-label"),
      tag: el.tagName,
    }));
    const owned = [...document.querySelectorAll("body *")].filter(
      (el) => (el.textContent || "").trim() === "You own this asset" && el.children.length === 0
    ).length;
    const discountedOwned = [...document.querySelectorAll('[data-test^="search-results-product-card-"]')].filter((card) => {
      return card.innerText.includes("You own this asset") && card.querySelector('[data-test="product-card-discount"]');
    }).map((card) => {
      const name = card.querySelector('[data-test="product-card-name"]');
      const discount = card.querySelector('[data-test="product-card-discount"]');
      return {
        name: name ? (name.textContent || "").trim() : "",
        discount: discount ? (discount.textContent || "").trim() : "",
      };
    });
    return { profile, ownedLeafCount: owned, discountedOwned: discountedOwned.slice(0, 20) };
  })()`);

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
