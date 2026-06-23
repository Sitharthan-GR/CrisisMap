/**
 * Records a walkthrough demo video:
 * 1. Admin — sign in and create a new crisis
 * 2. User — submit a damage report for that crisis
 * 3. Dashboard — show the new report on the map
 *
 * Requires frontend (5173) and backend (8000) to be running.
 * Reads ADMIN_PASSWORD from backend/.env
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const OUTPUT_DIR = join(__dirname, "output");
const CRISIS_NAME = process.env.DEMO_CRISIS_NAME ?? "Demo Coastal Storm 2026";

function loadAdminPassword() {
  const envPath = join(ROOT, "backend", ".env");
  const raw = readFileSync(envPath, "utf8");
  const match = raw.match(/^ADMIN_PASSWORD=(.*)$/m);
  if (!match?.[1]) {
    throw new Error("ADMIN_PASSWORD not found in backend/.env");
  }
  return match[1].trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pause(page, ms = 1800) {
  await page.waitForTimeout(ms);
}

async function searchAndPickPlace(page, query) {
  const searchInput = page.getByPlaceholder("Type address, place, or building name");
  await searchInput.click();
  await searchInput.fill(query);
  await page.waitForTimeout(1200);
  const result = page.locator("ul button").filter({ hasText: /./ }).first();
  await result.waitFor({ state: "visible", timeout: 15000 });
  await result.click();
  await page.waitForTimeout(800);
}

async function recordAdminFlow(page, adminPassword) {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
  await pause(page, 1200);

  await page.locator('input[type="password"]').fill(adminPassword);
  await pause(page, 600);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "New crisis" }).waitFor({ timeout: 20000 });
  await pause(page, 1500);

  await page.getByRole("button", { name: "New crisis" }).click();
  await page.getByRole("heading", { name: "New crisis" }).waitFor();
  await pause(page, 800);

  await page.locator("#admin-f-name").fill(CRISIS_NAME);
  await pause(page, 500);

  const subtypeField = page.locator("#admin-f-sub");
  await subtypeField.click();
  await subtypeField.fill("flood");
  await page.getByRole("option", { name: /flood/i }).first().click();
  await pause(page, 600);

  await searchAndPickPlace(page, "Knoxville, Tennessee");
  await pause(page, 1000);

  await page.getByRole("button", { name: "Create crisis" }).click();
  await page.getByRole("button", { name: "New crisis" }).waitFor({ timeout: 20000 });
  await page.getByText(CRISIS_NAME).first().waitFor({ timeout: 15000 });
  await pause(page, 2500);
}

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

  await searchAndPickPlace(page, "Market Square, Knoxville");
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
  const adminPassword = loadAdminPassword();
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
    geolocation: { latitude: 35.9606, longitude: -83.9207 },
    permissions: ["geolocation"],
    colorScheme: "dark",
  });

  const page = await context.newPage();

  try {
    console.log("Recording admin flow…");
    await recordAdminFlow(page, adminPassword);

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
