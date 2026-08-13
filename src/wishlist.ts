import type { Page } from "playwright";
import type { Deal } from "./types.js";
import { dismissCookieBanner } from "./auth.js";

const WISHLIST_BUTTON = '[data-test="saved-list-icon"]';
const WISHLIST_ICON =
  '[data-test="saved-list-icon"] .ifont-favorite, [data-test="saved-list-icon"] .ifont-favorite-border';

async function readWishlistState(page: Page): Promise<boolean | null> {
  try {
    return (await page.evaluate(`(() => {
      const btn = document.querySelector('[data-test="saved-list-icon"]');
      if (!btn) return null;
      const icon = btn.querySelector(".ifont");
      if (!icon) return null;
      const cls = " " + (icon.className || "") + " ";
      if (cls.includes(" ifont-favorite-border ")) return false;
      if (cls.includes(" ifont-favorite ")) return true;
      return null;
    })()`)) as boolean | null;
  } catch {
    // Soft navigations during hydrate can destroy the execution context.
    return null;
  }
}

async function pageShowsOwned(page: Page): Promise<boolean> {
  try {
    const ownedText = page.getByText("You own this asset", { exact: false });
    if ((await ownedText.count()) > 0) {
      if (await ownedText.first().isVisible().catch(() => false)) return true;
    }
    const libraryCta = page.locator(
      'button:has-text("Open in Unity"), a:has-text("Open in Unity"), [data-test*="purchased" i]'
    );
    const hasLibraryCta = (await libraryCta.count()) > 0;
    const hasWishlist = (await page.locator(WISHLIST_BUTTON).count()) > 0;
    return hasLibraryCta && !hasWishlist;
  } catch {
    return false;
  }
}

/**
 * Wishlist heart on the product detail page:
 * - on wishlist → `.ifont-favorite` (filled)
 * - not on list → `.ifont-favorite-border` (outline)
 *
 * Outline often paints first; filled state hydrates a few seconds later.
 */
export async function isOnWishlist(page: Page): Promise<boolean | null> {
  if (await pageShowsOwned(page)) return null;

  try {
    await page.waitForSelector(WISHLIST_BUTTON, { timeout: 20_000 });
    await page.waitForSelector(WISHLIST_ICON, { timeout: 15_000 });
  } catch {
    if (await pageShowsOwned(page)) return null;
    return null;
  }

  const started = Date.now();
  let last: boolean | null = null;
  let falseSince: number | null = null;

  while (Date.now() - started < 8_000) {
    const state = await readWishlistState(page);
    if (state !== null) last = state;

    if (state === true) return true;

    if (state === false) {
      if (falseSince === null) falseSince = Date.now();
      if (Date.now() - started >= 4_000 && Date.now() - falseSince >= 2_000) {
        return false;
      }
<<<<<<< HEAD
    } else if (state !== null) {
=======
    } else if (state === null) {
      // keep waiting through transient navigations
    } else {
>>>>>>> e208ee0 (Add wishlist)
      falseSince = null;
    }

    await page.waitForTimeout(250);
  }

  return last;
}

export type WishlistEnrichResult = {
  deals: Deal[];
  skippedOwned: number;
  unknown: number;
};

async function openDealPage(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
<<<<<<< HEAD
=======
  // Product pages often soft-redirect once; wait for URL/package id to settle.
>>>>>>> e208ee0 (Add wishlist)
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForTimeout(1500);
  await dismissCookieBanner(page);
}

export async function enrichDealsWithWishlist(
  page: Page,
  deals: Deal[]
): Promise<WishlistEnrichResult> {
  const enriched: Deal[] = [];
  let skippedOwned = 0;
  let unknown = 0;

  console.log(`Checking wishlist status for ${deals.length} deals...`);

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i]!;
    process.stdout.write(`  [${i + 1}/${deals.length}] ${deal.name.slice(0, 60)}... `);

<<<<<<< HEAD
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      try {
        await openDealPage(page, deal.url);
=======
    try {
      await openDealPage(page, deal.url);
>>>>>>> e208ee0 (Add wishlist)

        if (await pageShowsOwned(page)) {
          skippedOwned++;
          console.log("owned (skip)");
          done = true;
          break;
        }

        const onWishlist = await isOnWishlist(page);
        if (onWishlist === null) {
          if (attempt < 2) {
            process.stdout.write("retry... ");
            continue;
          }
          unknown++;
          enriched.push({ ...deal, onWishlist: false });
          console.log("unknown");
          done = true;
          break;
        }

        enriched.push({ ...deal, onWishlist });
        console.log(onWishlist ? "WISHLIST" : "no");
        done = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt < 2) {
          process.stdout.write("retry... ");
          await page.waitForTimeout(1000);
          continue;
        }
        unknown++;
        enriched.push({ ...deal, onWishlist: false });
        console.log(`error (${message.slice(0, 80)})`);
        done = true;
      }
    }
  }

  return { deals: enriched, skippedOwned, unknown };
}
