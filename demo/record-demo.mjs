/**
 * Records a walkthrough demo video:
 * 1. Admin — sign in
 * 2. User — submit a damage report for a seeded crisis
 * 3. Dashboard — show the report on the map
 *
 * Requires frontend (5173) and backend (8000) to be running.
 * Reads ADMIN_PASSWORD from backend/.env
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_URL,
  CRISIS_NAME,
  DEMO_GEOLOCATION,
  DEMO_REPORT_LOCATION,
  adminLogin,
  pause,
  searchAndPickPlace,
} from "./lib/demo-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");

async function recordUserReportFlow(page) {
  await page.goto(`${BASE_URL}/report`, { waitUntil: "networkidle" });
  await pause(page, 1200);

  const crisisSelect = page.locator("select.report-wizard-field");
  await crisisSelect.waitFor({ timeout: 20000 });
  const options = await crisisSelect.locator("option").allTextContents();
  const matchIndex = options.findIndex((text) => text.includes(CRISIS_NAME));
  if (matchIndex < 0) {
    throw new Error(`Crisis "${CRISIS_NAME}" not found in report dropdown`);
  }
  await crisisSelect.selectOption({ index: matchIndex });
  await pause(page, 1000);

  await page.getByText("How damaged is the structure?").waitFor({ timeout: 20000 });
  await page.locator(".report-wizard-option").filter({ hasText: "Partial" }).click();
  await pause(page, 700);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator(".report-wizard-option").filter({ hasText: "Residential" }).click();
  await pause(page, 700);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator(".report-wizard-option").filter({ hasText: "Flood" }).click();
  await pause(page, 700);
  await page.getByRole("button", { name: "Continue" }).click();

  await page
    .getByRole("button", { name: /No.*Site is clear/i })
    .click();
  await pause(page, 700);
  await page.getByRole("button", { name: "Continue" }).click();

  await searchAndPickPlace(page, DEMO_REPORT_LOCATION);
  await pause(page, 1000);
  await page.getByRole("button", { name: "Continue" }).click();

  await page
    .getByPlaceholder("Leave blank to report anonymously")
    .fill("Demo Reporter");
  await page.locator("textarea").fill("Roof damage and standing water after heavy rainfall.");
  await pause(page, 1200);

  await page.getByRole("button", { name: "Submit report" }).click();
  await page.getByText("Report submitted").waitFor({ timeout: 30000 });
  await pause(page, 3000);
}

async function recordDashboardFlow(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await pause(page, 2000);

  const searchInput = page.getByPlaceholder("Search or select a crisis…");
  if (await searchInput.isVisible()) {
    await searchInput.click();
    await searchInput.fill(CRISIS_NAME);
    await pause(page, 800);
    const crisisOption = page.getByText(CRISIS_NAME).first();
    if (await crisisOption.isVisible()) {
      await crisisOption.click();
      await pause(page, 2500);
    }
  }

  await pause(page, 2000);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    slowMo: 120,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1280, height: 720 },
    },
    geolocation: DEMO_GEOLOCATION,
    permissions: ["geolocation"],
    colorScheme: "dark",
  });

  const page = await context.newPage();

  try {
    console.log("Recording admin login…");
    await adminLogin(page);

    console.log("Recording user report flow…");
    await recordUserReportFlow(page);

    console.log("Recording dashboard…");
    await recordDashboardFlow(page);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const webmPath = await video.path();
      const finalPath = join(OUTPUT_DIR, "crisismap-demo.webm");
      if (existsSync(webmPath)) {
        const { renameSync } = await import("node:fs");
        renameSync(webmPath, finalPath);
        console.log(`\nDemo video saved to:\n  ${finalPath}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
