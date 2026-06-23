/**
 * Capture screenshots from the live CrisisMap deployment for the design document.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "..", "docs", "screenshots");
const BASE_URL = process.env.DEMO_BASE_URL ?? "https://crisis-map-phi.vercel.app";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function shot(page, name) {
  const path = join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`Saved ${path}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "01-dashboard");

  await page.goto(`${BASE_URL}/report`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, "02-report-wizard");

  await page.goto(`${BASE_URL}/help`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, "03-map-help");

  await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, "04-admin-login");

  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordInput.fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    await shot(page, "05-admin-dashboard");

    const unlistedTab = page.getByRole("tab", { name: /unlisted/i });
    if (await unlistedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unlistedTab.click();
      await page.waitForTimeout(2000);
      await shot(page, "06-admin-unlisted");
    }

    await page.goto(`${BASE_URL}/admin/forms`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "07-form-builder");
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
