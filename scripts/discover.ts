import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(
    "https://assetstore.unity.com/listing#f-ec_sale_filters=on_sale,flash_deal",
    { waitUntil: "domcontentloaded", timeout: 60_000 }
  );
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const leafDiscount = [...document.querySelectorAll("body *")].filter((el) => {
      const t = (el.textContent || "").trim();
      return /^-?\d+%$/.test(t) && el.children.length === 0;
    });

    const samples = leafDiscount.slice(0, 3).map((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      let found: Record<string, unknown> | null = null;
      for (let i = 0; i < 16 && n; i++) {
        const text = n.innerText || "";
        const link = n.querySelector('a[href*="/packages/"]') as HTMLAnchorElement | null;
        if (link && /\$[\d.]+/.test(text)) {
          found = {
            depth: i,
            tag: n.tagName,
            className: String(n.className).slice(0, 200),
            href: link.href,
            linkText: (link.textContent || "").trim().slice(0, 120),
            textSample: text.slice(0, 400),
            html: n.outerHTML.slice(0, 2500),
          };
          break;
        }
        n = n.parentElement;
      }
      return (
        found || {
          fail: true,
          discount: (el.textContent || "").trim(),
          parentClass: String(el.parentElement?.className || "").slice(0, 200),
          parentHtml: el.parentElement?.outerHTML.slice(0, 800),
        }
      );
    });

    const packageLinks = [...document.querySelectorAll('a[href*="/packages/"]')].length;

    const pagCandidates = [...document.querySelectorAll("button, a, [role='button'], li")].filter(
      (el) => {
        const t = (el.textContent || "").trim();
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        return (
          /^(next|previous|\d+)$/i.test(t) ||
          aria.includes("next") ||
          aria.includes("previous") ||
          aria.includes("page")
        );
      }
    );

    const pag = pagCandidates.slice(0, 30).map((el) => ({
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 40),
      aria: el.getAttribute("aria-label"),
      className: String(el.className).slice(0, 160),
      role: el.getAttribute("role"),
    }));

    return {
      title: document.title,
      url: location.href,
      leafDiscountCount: leafDiscount.length,
      packageLinks,
      samples,
      pag,
    };
  });

  writeFileSync("discovery.json", JSON.stringify(info, null, 2));
  console.log("Wrote discovery.json");
  console.log(
    JSON.stringify(
      {
        leafDiscountCount: info.leafDiscountCount,
        packageLinks: info.packageLinks,
        sampleCount: info.samples.length,
        firstSampleKeys: info.samples[0] ? Object.keys(info.samples[0]) : [],
        pagCount: info.pag.length,
      },
      null,
      2
    )
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
