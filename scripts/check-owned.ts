import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
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
    const cards = [...document.querySelectorAll('[data-test^="search-results-product-card-"]')];
    const ownedCards = cards.filter((card) => card.innerText.includes("You own this asset")).slice(0, 5);
    return {
      totalCards: cards.length,
      ownedCards: ownedCards.length,
      samples: ownedCards.map((card) => ({
        name: (card.querySelector('[data-test="product-card-name"]') || {}).textContent || "",
        dataTests: [...card.querySelectorAll("[data-test]")].map((el) => el.getAttribute("data-test")),
        textSample: card.innerText.slice(0, 400),
        currentPrice: (card.querySelector('[data-test="product-card-current-price"]') || {}).textContent || null,
        originalPrice: (card.querySelector('[data-test="product-card-original-price"]') || {}).textContent || null,
        discount: (card.querySelector('[data-test="product-card-discount"]') || {}).textContent || null,
      })),
    };
  })()`);

  writeFileSync("discovery-owned.json", JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
