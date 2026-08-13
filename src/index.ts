import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dismissCookieBanner,
  hasStoredSession,
  isSignedIn,
  persistStorageState,
  signIn,
  STORAGE_STATE_PATH,
} from "./auth.js";
import { loadConfig } from "./config.js";
import { scrapeAllDeals } from "./scrape.js";
import { enrichDealsWithWishlist } from "./wishlist.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function main(): Promise<void> {
  const config = loadConfig();

  console.log("Unity Flash Deals scraper");
  console.log(`  URL:          ${config.flashDealsUrl}`);
  console.log(`  Min discount: ${config.minDiscountPercent}%`);
  console.log(`  Headless:     ${config.headless}`);
  console.log(`  SlowMo:       ${config.slowMo}ms`);
  console.log(`  Wishlist:     ${config.skipWishlist ? "skip" : "check each deal"}`);

  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  });

  const useStoredSession = !config.forceLogin && hasStoredSession();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    ...(useStoredSession ? { storageState: STORAGE_STATE_PATH } : {}),
  });

  const page = await context.newPage();

  // Always load the store home first so we can see auth state.
  await page.goto("https://assetstore.unity.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);
  await dismissCookieBanner(page);

  let signedIn = await isSignedIn(page);

  if (config.skipLogin) {
    if (!useStoredSession) {
      console.warn("--skip-login set but no storage-state.json found; continuing signed out.");
    } else if (signedIn) {
      console.log("Using stored session (--skip-login).");
    } else {
      console.warn(
        "Stored session present but Asset Store looks signed out. Owned/wishlist data will be wrong. Re-run without --skip-login or use --force-login."
      );
    }
  } else if (signedIn && !config.forceLogin) {
    console.log("Stored session is still valid.");
  } else {
    if (config.forceLogin) console.log("Forcing fresh sign-in...");
    else if (useStoredSession) console.log("Stored session expired; signing in again...");
    await signIn(page, config);
    await persistStorageState(context);
    signedIn = true;
  }

  console.log("Loading flash deals listing...");
  await page.goto(config.flashDealsUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await dismissCookieBanner(page);

  let deals = await scrapeAllDeals(page, {
    minDiscountPercent: config.minDiscountPercent,
    excludeOwned: true,
  });

  let skippedOwnedOnDetail = 0;
  if (!config.skipWishlist && deals.length > 0) {
    if (!(await isSignedIn(page))) {
      console.warn("Not signed in — wishlist checks will be unreliable.");
    }
    const wishlistResult = await enrichDealsWithWishlist(page, deals);
    deals = wishlistResult.deals;
    skippedOwnedOnDetail = wishlistResult.skippedOwned;
    if (skippedOwnedOnDetail > 0) {
      console.log(`Removed ${skippedOwnedOnDetail} owned asset(s) found on detail pages.`);
    }
    if (wishlistResult.unknown > 0) {
      console.log(`Wishlist unknown for ${wishlistResult.unknown} deal(s).`);
    }
  }

  deals.sort(
    (a, b) =>
      Number(b.onWishlist === true) - Number(a.onWishlist === true) ||
      b.discountPercent - a.discountPercent ||
      a.publisher.localeCompare(b.publisher) ||
      a.name.localeCompare(b.name)
  );

  const wishlistCount = deals.filter((d) => d.onWishlist === true).length;

  console.log("\nMatching deals (excluding owned):");
  if (deals.length === 0) {
    console.log("  (none)");
  } else {
    const rows = deals.map((deal) => ({
      wishlist: deal.onWishlist === true ? "YES" : "",
      publisher: deal.publisher,
      name: deal.name,
      price: deal.price,
      discount: `${deal.discountPercent}%`,
      url: deal.url,
    }));
    console.table(rows);
    if (!config.skipWishlist) {
      console.log(`\nWishlist hits: ${wishlistCount} / ${deals.length}`);
    }
  }

  const output = {
    scrapedAt: new Date().toISOString(),
    minDiscountPercent: config.minDiscountPercent,
    signedIn: await isSignedIn(page).catch(() => signedIn),
    wishlistChecked: !config.skipWishlist,
    wishlistCount,
    count: deals.length,
    deals: deals.map(({ publisher, name, price, discountPercent, url, onWishlist }) => ({
      onWishlist: onWishlist === true,
      publisher,
      name,
      price,
      discount: `${discountPercent}%`,
      url,
    })),
  };

  const outPath = resolve(ROOT, "results.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${deals.length} deals to ${outPath}`);

  if (!config.skipLogin) {
    await persistStorageState(context).catch(() => undefined);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
