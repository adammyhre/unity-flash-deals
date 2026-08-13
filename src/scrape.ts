import type { Page } from "playwright";
import type { Deal, ScrapePageResult } from "./types.js";

const CARD_SELECTOR = '[data-test^="search-results-product-card-"]';
const NAME_SELECTOR = '[data-test="product-card-name"]';
const NEXT_PAGE_SELECTOR = '[aria-label="Go to the next page"]';

export function parseDiscountPercent(text: string): number | null {
  const match = text.trim().match(/^-?(\d+(?:\.\d+)?)\s*%$/);
  if (!match) return null;
  return Number(match[1]);
}

export async function waitForListing(page: Page): Promise<void> {
  await page.waitForSelector(CARD_SELECTOR, { timeout: 60_000 });
  // SPA sometimes fills cards in waves; brief settle helps pagination/content swaps.
  await page.waitForTimeout(1000);
}

export async function scrapeCurrentPage(page: Page): Promise<ScrapePageResult> {
  await waitForListing(page);

  const raw = (await page.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-test^="search-results-product-card-"]')];
    return cards.map((card) => {
      const publisherEl = card.querySelector('[data-test="product-card-publisher"]');
      const nameEl = card.querySelector('[data-test="product-card-name"]');
      const priceEl = card.querySelector('[data-test="product-card-current-price"]');
      const discountEl = card.querySelector('[data-test="product-card-discount"]');
      const purchased = card.querySelector('[data-test="product-card-purchased-label"]');
      const owned =
        !!purchased ||
        card.innerText.includes("You own this asset");
      return {
        publisher: publisherEl ? (publisherEl.textContent || "").trim() : "",
        name: nameEl ? (nameEl.textContent || "").trim() : "",
        price: priceEl ? (priceEl.textContent || "").trim() : "",
        discountText: discountEl ? (discountEl.textContent || "").trim() : "",
        url: nameEl && nameEl.href ? nameEl.href : "",
        owned,
      };
    });
  })()`)) as Array<{
    publisher: string;
    name: string;
    price: string;
    discountText: string;
    url: string;
    owned: boolean;
  }>;

  const deals: Deal[] = [];
  let ownedCount = 0;
  for (const row of raw) {
    if (row.owned) ownedCount++;
    if (!row.name || !row.url || !row.discountText) continue;
    const discountPercent = parseDiscountPercent(row.discountText);
    if (discountPercent === null) continue;
    deals.push({
      publisher: row.publisher,
      name: row.name,
      price: row.price,
      discountPercent,
      url: row.url,
      owned: row.owned,
    });
  }

  const next = page.locator(NEXT_PAGE_SELECTOR);
  const nextCount = await next.count();
  let hasNextPage = false;
  if (nextCount > 0) {
    const disabled = await next.first().isDisabled().catch(() => true);
    const ariaDisabled = await next.first().getAttribute("aria-disabled");
    hasNextPage = !disabled && ariaDisabled !== "true";
  }

  return { deals, ownedCount, hasNextPage };
}

export async function goToNextPage(page: Page): Promise<boolean> {
  const next = page.locator(NEXT_PAGE_SELECTOR).first();
  if ((await next.count()) === 0) return false;
  if (await next.isDisabled()) return false;
  if ((await next.getAttribute("aria-disabled")) === "true") return false;

  const firstName = ((await page.locator(NAME_SELECTOR).first().textContent()) || "").trim();

  await next.click();

  // Wait until the first product title changes after pagination.
  await page
    .waitForFunction(
      `(() => {
        const el = document.querySelector('[data-test="product-card-name"]');
        const text = el ? (el.textContent || "").trim() : "";
        return text.length > 0 && text !== ${JSON.stringify(firstName)};
      })()`,
      undefined,
      { timeout: 30_000 }
    )
    .catch(() => undefined);

  await waitForListing(page);
  return true;
}

export async function scrapeAllDeals(
  page: Page,
  options: { minDiscountPercent: number; maxPages?: number; excludeOwned?: boolean }
): Promise<Deal[]> {
  const { minDiscountPercent, maxPages = 50, excludeOwned = true } = options;
  const seen = new Set<string>();
  const matches: Deal[] = [];

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`Scraping page ${pageNum}...`);
    const { deals, ownedCount, hasNextPage } = await scrapeCurrentPage(page);

    let pageMatches = 0;
    for (const deal of deals) {
      if (seen.has(deal.url)) continue;
      seen.add(deal.url);

      if (excludeOwned && deal.owned) continue;
      if (deal.discountPercent < minDiscountPercent) continue;

      matches.push(deal);
      pageMatches++;
    }

    console.log(
      `  Found ${deals.length} discounted cards, ${ownedCount} owned, ${pageMatches} matched (>= ${minDiscountPercent}%)`
    );

    if (!hasNextPage) break;
    const advanced = await goToNextPage(page);
    if (!advanced) break;
  }

  return matches;
}
