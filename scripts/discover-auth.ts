import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

async function dump(page: import("playwright").Page, label: string) {
  const info = await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("button, a, [role='button']")].slice(0, 80).map((el) => ({
      tag: el.tagName,
      text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
      aria: el.getAttribute("aria-label"),
      dataTest: el.getAttribute("data-test"),
      href: el.getAttribute("href"),
      className: String(el.className).slice(0, 120),
    }));
    const inputs = [...document.querySelectorAll("input, button[type='submit']")].map((el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.id,
      aria: el.getAttribute("aria-label"),
      placeholder: el.getAttribute("placeholder"),
      dataTest: el.getAttribute("data-test"),
      text: (el.textContent || "").trim().slice(0, 60),
    }));
    return {
      url: location.href,
      title: document.title,
      buttons: buttons.filter((b) =>
        /sign|account|profile|user|login|create|human|avatar/i.test(
          [b.text, b.aria, b.dataTest, b.className].join(" ")
        )
      ),
      allInputs: inputs,
      menuItems: [...document.querySelectorAll("[role='menuitem'], li a, li button")].slice(0, 40).map((el) => ({
        tag: el.tagName,
        text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
        aria: el.getAttribute("aria-label"),
        dataTest: el.getAttribute("data-test"),
        href: el.getAttribute("href"),
      })),
    };
  })()`);
  writeFileSync(`discovery-auth-${label}.json`, JSON.stringify(info, null, 2));
  console.log(`Wrote discovery-auth-${label}.json — url=${info.url}`);
  return info;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("https://assetstore.unity.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(4000);
  await dump(page, "home");

  // Try common profile / account triggers
  const candidates = [
    '[data-test*="account"]',
    '[data-test*="user"]',
    '[data-test*="profile"]',
    '[aria-label*="Account" i]',
    '[aria-label*="Sign" i]',
    '[aria-label*="profile" i]',
    'button:has(svg)',
  ];

  for (const sel of candidates) {
    const loc = page.locator(sel);
    const count = await loc.count();
    console.log(`candidate ${sel}: ${count}`);
  }

  // Heuristic: click top-right circular account control
  const clicked = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll("button, a, [role='button']")];
    const hit = els.find((el) => {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const test = (el.getAttribute("data-test") || "").toLowerCase();
      return (
        aria.includes("account") ||
        aria.includes("sign in") ||
        aria.includes("user menu") ||
        aria.includes("profile") ||
        test.includes("account") ||
        test.includes("user-menu") ||
        test.includes("avatar")
      );
    });
    if (!hit) return { ok: false, reason: "no aria/data-test match" };
    hit.click();
    return {
      ok: true,
      aria: hit.getAttribute("aria-label"),
      dataTest: hit.getAttribute("data-test"),
      className: String(hit.className).slice(0, 160),
    };
  })()`);
  console.log("click account:", clicked);
  await page.waitForTimeout(1500);
  const afterMenu = await dump(page, "menu");

  // Click Sign In if present
  const signIn = page.getByRole("menuitem", { name: /sign in/i })
    .or(page.getByRole("link", { name: /sign in/i }))
    .or(page.getByRole("button", { name: /sign in/i }))
    .or(page.getByText("Sign In", { exact: true }));

  if (await signIn.count()) {
    await signIn.first().click();
    await page.waitForTimeout(4000);
    await dump(page, "signin");
  } else {
    console.log("Sign In control not found after menu open");
    console.log(JSON.stringify(afterMenu.menuItems?.slice(0, 20), null, 2));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
