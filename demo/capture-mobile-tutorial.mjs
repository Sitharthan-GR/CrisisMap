/**
 * Capture mobile viewport screenshots for the Help → How to use tutorial.
 * Uses client-side navigation from "/" because Vercel SPA rewrites may 404
 * on direct deep links in some deployments.
 *
 * Optional: set DEMO_BASE_URL. After capture, run cwebp if available.
 */
import { chromium, devices } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(
  __dirname,
  "..",
  "frontend",
  "public",
  "help",
  "mobile",
);
const BASE_URL = process.env.DEMO_BASE_URL ?? "https://crisis-map-phi.vercel.app";

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`Saved ${path}`);
}

async function tapNav(page, label) {
  const btn = page.locator(".mobile-bottom-nav button", { hasText: label });
  await btn.click();
  await page.waitForTimeout(1000);
}

function optimizeOutputs() {
  const names = [
    "01-map",
    "02-search",
    "03-feed",
    "04-report-damage",
    "05-report-infra",
    "07-report-location",
  ];
  for (const name of names) {
    const png = join(OUT_DIR, `${name}.png`);
    if (!existsSync(png)) continue;
    spawnSync("sips", ["-Z", "780", png, "--out", png], { stdio: "ignore" });
    const webp = join(OUT_DIR, `${name}.webp`);
    const result = spawnSync("cwebp", ["-q", "78", png, "-o", webp], {
      stdio: "ignore",
    });
    if (result.status === 0) console.log(`Optimized ${webp}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const iPhone = devices["iPhone 13 Pro"];
  const context = await browser.newContext({
    ...iPhone,
    colorScheme: "dark",
    locale: "en-US",
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(3500);

  await shot(page, "01-map");

  await tapNav(page, "Search");
  await page.waitForTimeout(600);
  await shot(page, "02-search");

  await tapNav(page, "Feed");
  await page.waitForTimeout(800);
  await shot(page, "03-feed");

  await tapNav(page, "Report");
  await page.waitForTimeout(2500);
  await shot(page, "04-report-damage");

  const damageBtn = page.locator(".report-wizard-option").first();
  if (await damageBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await damageBtn.click();
    await page.waitForTimeout(400);
    await page.locator(".report-wizard-continue").click();
    await page.waitForTimeout(900);
    await shot(page, "05-report-infra");

    const infraBtn = page.locator(".report-wizard-option").first();
    if (await infraBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await infraBtn.click();
      await page.waitForTimeout(300);
      await page.locator(".report-wizard-continue").click();
      await page.waitForTimeout(900);

      const causeBtn = page.locator(".report-wizard-option").first();
      if (await causeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await causeBtn.click();
        await page.waitForTimeout(300);
        await page.locator(".report-wizard-continue").click();
        await page.waitForTimeout(800);

        const debrisBtn = page.locator(".report-wizard-option").first();
        if (await debrisBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await debrisBtn.click();
          await page.waitForTimeout(300);
          await page.locator(".report-wizard-continue").click();
          await page.waitForTimeout(1200);
          await shot(page, "07-report-location");
        }
      }
    }
  }

  await browser.close();
  optimizeOutputs();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
