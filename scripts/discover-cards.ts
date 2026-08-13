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

  const info = await page.evaluate(`(() => {
    const names = [...document.querySelectorAll('[data-test="product-card-name"]')];

    const cards = names.slice(0, 5).map((nameEl) => {
      let root = nameEl;
      for (let i = 0; i < 12; i++) {
        const parent = root.parentElement;
        if (!parent) break;
        if (parent.querySelectorAll('[data-test="product-card-name"]').length !== 1) break;
        root = parent;
      }

      const priceBits = [...root.querySelectorAll("*")]
        .filter((el) => el.children.length === 0 && /\\$|%|own/i.test(el.textContent || ""))
        .map((el) => ({
          text: (el.textContent || "").trim(),
          className: String(el.className).slice(0, 140),
          tag: el.tagName,
          dataTest: el.getAttribute("data-test"),
          parentDataTest: el.parentElement ? el.parentElement.getAttribute("data-test") : null,
          parentClass: String(el.parentElement && el.parentElement.className || "").slice(0, 140),
        }));

      const dataTests = [...root.querySelectorAll("[data-test]")].map((el) =>
        el.getAttribute("data-test")
      );

      return {
        name: (nameEl.textContent || "").trim(),
        href: nameEl.href,
        rootClass: String(root.className).slice(0, 180),
        rootTag: root.tagName,
        dataTests: [...new Set(dataTests)],
        priceBits,
        hasOwn: root.innerText.includes("You own this asset"),
        textSample: root.innerText.slice(0, 350),
      };
    });

    const nextBtn = document.querySelector('[aria-label="Go to the next page"]');
    return {
      nameCount: names.length,
      cards,
      nextInfo: nextBtn
        ? {
            disabled: nextBtn.disabled,
            className: String(nextBtn.className).slice(0, 200),
            ariaDisabled: nextBtn.getAttribute("aria-disabled"),
          }
        : null,
    };
  })()`);

  writeFileSync("discovery-cards.json", JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info, null, 2).slice(0, 10000));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
