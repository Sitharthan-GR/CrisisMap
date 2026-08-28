/**
 * Capture Form Builder screenshots for the Help → How to use guide.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "frontend", "public", "help", "forms");
const BASE_URL = process.env.DEMO_BASE_URL ?? "https://crisis-map-phi.vercel.app";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`Saved ${path}`);
}

function optimizeOutputs() {
  const names = [
    "01-open-builder",
    "02-new-form",
    "03-drag-fields",
    "04-edit-preview",
  ];
  for (const name of names) {
    const png = join(OUT_DIR, `${name}.png`);
    if (!existsSync(png)) continue;
    spawnSync("sips", ["-Z", "1200", png, "--out", png], { stdio: "ignore" });
    spawnSync("cwebp", ["-q", "82", png, "-o", join(OUT_DIR, `${name}.webp`)], {
      stdio: "ignore",
    });
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);

  // Admin login via client-side nav
  await page.evaluate(() => {
    window.history.pushState({}, "", "/admin");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(1500);

  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await passwordInput.fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(2500);
  }

  await page.evaluate(() => {
    window.history.pushState({}, "", "/admin/forms");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(2500);
  await shot(page, "01-open-builder");

  const newFormBtn = page.getByRole("button", { name: /new form/i });
  if (await newFormBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await newFormBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, "02-new-form");

    // Fill basic metadata
    const nameInput = page.locator("#form-name");
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill("Flood Impact Assessment");
      await page.locator("#form-title").fill("Flood damage survey");
      await page.waitForTimeout(400);
    }

    // Add fields via click (same as drop)
    for (const label of ["Text", "Dropdown", "Paragraph"]) {
      const chip = page.locator(".field-type", { hasText: label }).first();
      if (await chip.isVisible({ timeout: 2000 }).catch(() => false)) {
        await chip.click();
        await page.waitForTimeout(350);
      }
    }
    await shot(page, "03-drag-fields");

    // Open first field editor
    const editBtn = page.locator(".form-item-actions button").first();
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(800);
    }
    await shot(page, "04-edit-preview");
  }

  await browser.close();
  optimizeOutputs();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
