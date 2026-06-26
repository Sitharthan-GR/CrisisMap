/**
 * Pitch demo (≤2 min): capture & display, secure storage, export, offline sync.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync, renameSync, copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import narration from "./narration.json" with { type: "json" };
import {
  ADMIN_PASSWORD,
  BASE_URL,
  CRISIS_NAME,
  DEMO_GEOLOCATION,
  DEMO_REPORT_LOCATION,
  ISTANBUL_HISTORY_REPORT_ID,
  createCueLogger,
  pause,
  removeOverlay,
  showCaption,
  showOverlay,
  showPasswordOverlay,
  searchAndPickPlace,
  fillReportWizard,
  adminLogin,
  TIMING,
} from "./lib/demo-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");

/** Crisis created during the demo — used for offline sync seeding. */
let demoCrisisId = null;

async function chapterIntro(page, cue) {
  cue.mark("intro", narration.intro);
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await showCaption(page, "CrisisMap — Damage assessment for crisis response");
  await pause(page, 2800);
  await removeOverlay(page);
}

async function chapterCreateCrisis(page, cue) {
  cue.mark("create-crisis", narration["create-crisis"]);
  await showCaption(page, "Admin: open an active crisis");

  await page.getByText(CRISIS_NAME).first().click();
  await pause(page, 1200);

  await showOverlay(
    page,
    `<div style="font-size:13px;color:#94a3b8;margin-bottom:8px">Active crisis</div>
     <div style="font-size:16px">${CRISIS_NAME}</div>
     <div style="font-size:12px;color:#94a3b8;margin-top:6px">Custom form template attached for field teams</div>`,
    "bottom-center",
  );
  await pause(page, 2400);
  await removeOverlay(page);
  await pause(page, 800);
}

async function chapterUserReport(page, cue) {
  cue.mark("user-report", narration["user-report"]);
  await page.goto(`${BASE_URL}/report`, { waitUntil: "domcontentloaded" });
  await showCaption(page, "User: report damage");
  await pause(page, 1200);

  const crisisSelect = page.locator("select.report-wizard-field");
  await crisisSelect.waitFor({ timeout: 20000 });

  const selectedLabel = await crisisSelect.locator("option:checked").textContent();
  await showOverlay(
    page,
    `<div style="font-size:13px;color:#94a3b8;margin-bottom:6px">Auto-selected crisis</div>
     <div style="font-size:16px">${selectedLabel?.trim() ?? "Nearest crisis"}</div>
     <div style="font-size:12px;color:#94a3b8;margin-top:6px">Based on your GPS location</div>`,
    "top-center",
  );
  await pause(page, 2400);
  await removeOverlay(page);

  if (!selectedLabel?.includes(CRISIS_NAME)) {
    const options = await crisisSelect.locator("option").allTextContents();
    const idx = options.findIndex((t) => t.includes(CRISIS_NAME));
    if (idx >= 0) await crisisSelect.selectOption({ index: idx });
  }

  demoCrisisId = await crisisSelect.inputValue();

  await fillReportWizard(page, {
    locationQuery: DEMO_REPORT_LOCATION,
    description:
      "Standing water in ground-floor rooms after overnight monsoon rainfall.",
  });
  await pause(page, 1800);
}

async function chapterDashboard(page, cue) {
  cue.mark("dashboard", narration.dashboard);
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await showCaption(page, "Dashboard: view reports on the map");
  await pause(page, 1500);

  const searchInput = page.getByPlaceholder("Search or select a crisis…");
  await searchInput.click();
  await searchInput.fill(CRISIS_NAME);
  await pause(page, 900);
  const crisisOption = page.getByText(CRISIS_NAME).first();
  if (await crisisOption.isVisible()) {
    await crisisOption.click();
    await pause(page, 2200);
  }
}

async function chapterVersionHistory(page, cue) {
  cue.mark("history", narration.history);
  await page.goto(`${BASE_URL}/reports/${ISTANBUL_HISTORY_REPORT_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await showCaption(page, "Same building — damage history");
  await pause(page, 1600);

  await page.getByRole("button", { name: "History" }).click();
  await pause(page, 1400);

  const historyTitle = page.getByText("Damage history — same building");
  if (await historyTitle.isVisible()) {
    await historyTitle.scrollIntoViewIfNeeded();
    await pause(page, 1600);
  }

  const v1 = page.getByText(/^v1$/).first();
  if (await v1.isVisible()) {
    await v1.click();
    await pause(page, 2000);
  }
}

async function seedPendingReport(page, crisisId) {
  await page.evaluate(async ({ cid, geo }) => {
    const item = {
      id: crypto.randomUUID(),
      status: "pending",
      queuedAt: new Date().toISOString(),
      payload: {
        crisis_id: cid,
        damage_level: "minimal",
        infra_type: "residential",
        debris_present: false,
        nature_of_crisis: "flood",
        description_raw: "Structural cracks — queued offline, syncing when online.",
        reporter_name: "Alex Morgan",
        source_language: "en",
        submission_channel: "web",
        collected_at: new Date().toISOString(),
        location: {
          latitude: geo.latitude,
          longitude: geo.longitude,
          location_method: "gps",
        },
      },
      photos: [],
      retryCount: 0,
    };
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("crisismap-offline", 1);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("pending-reports")) {
          const store = db.createObjectStore("pending-reports", { keyPath: "id" });
          store.createIndex("by-status", "status");
        }
      };
      req.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction("pending-reports", "readwrite");
        tx.objectStore("pending-reports").put(item);
        tx.oncomplete = () => resolve(item.id);
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, { cid: crisisId, geo: DEMO_GEOLOCATION });
}

async function chapterOfflineSync(page, cue) {
  cue.mark("offline", narration.offline);

  let crisisId = demoCrisisId;
  if (!crisisId) {
    crisisId = await page.evaluate(async ({ geo, crisisName }) => {
      const response = await fetch(
        `/api/v1/crises/reporting-options?lat=${geo.latitude}&lng=${geo.longitude}`,
      );
      const body = await response.json();
      const data = body.data ?? body;
      const match =
        data.crises?.find((c) => c.name === crisisName) ?? data.crises?.[0];
      return match?.id ?? null;
    }, { geo: DEMO_GEOLOCATION, crisisName: CRISIS_NAME });
  }

  await page.goto(`${BASE_URL}/report`, { waitUntil: "domcontentloaded" });
  await showCaption(page, "Offline — report saved on device");
  await pause(page, 1000);

  await showOverlay(
    page,
    `<div style="font-size:14px">Report saved on this device</div>
     <div style="font-size:12px;color:#94a3b8;margin-top:6px">It will submit automatically when you're back online</div>`,
    "top-center",
  );
  await pause(page, 2000);
  await removeOverlay(page);

  const blockSync = async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes("/api/v1/health")) {
      await route.abort();
      return;
    }
    if (req.method() === "POST" && /\/api\/v1\/reports\/?$/.test(url)) {
      await route.abort();
      return;
    }
    await route.continue();
  };
  await page.route("**/*", blockSync);

  await seedPendingReport(page, crisisId);

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await pause(page, 1000);

  const pendingBanner = page.getByText(/report.*waiting to sync/i);
  await pendingBanner.waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1400);

  await page.unroute("**/*", blockSync);

  const syncBtn = page.getByRole("button", { name: "Sync now" });
  await syncBtn.waitFor({ state: "visible", timeout: 10000 });
  await syncBtn.click();
  await pause(page, 2800);

  await showCaption(page, "Synced — report now on the map");
  await pause(page, 1400);
}

async function chapterExport(page, cue) {
  cue.mark("export", narration.export);
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await showCaption(page, "Export for humanitarian partners");
  await pause(page, 1000);

  await page.getByRole("button", { name: "Export data" }).click();
  await page.getByRole("heading", { name: "Export report data" }).waitFor({
    timeout: 15000,
  });
  await pause(page, 1200);

  const formatSelect = page.locator("#export-format");
  await formatSelect.click();
  await pause(page, 600);
  await showOverlay(
    page,
    `<div style="font-size:13px;color:#94a3b8;margin-bottom:8px">Export formats</div>
     <div style="font-size:14px">CSV · GeoJSON · Shapefile</div>`,
    "bottom-center",
  );
  await pause(page, 2000);
  await removeOverlay(page);

  await formatSelect.selectOption({ label: "CSV" });
  await pause(page, 700);

  const crisisSelect = page.locator("#export-crisis");
  if (await crisisSelect.isVisible()) {
    await crisisSelect.selectOption({ label: "All crises" });
    await pause(page, 800);
  }

  const exportBtn = page.locator(".export-modal-foot .btn-primary");
  const downloadPromise = page
    .waitForEvent("download", { timeout: 20000 })
    .catch(() => null);
  await exportBtn.click();
  await downloadPromise;
  await pause(page, 2000);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const { cues, start, mark } = createCueLogger();

  const browser = await chromium.launch({
    headless: true,
    slowMo: TIMING.slowMo,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1280, height: 720 } },
    geolocation: DEMO_GEOLOCATION,
    permissions: ["geolocation"],
    colorScheme: "dark",
    acceptDownloads: true,
  });

  const page = await context.newPage();
  start();

  try {
    console.log("1/8 — Homepage intro");
    await chapterIntro(page, { mark });

    console.log("2/8 — Admin login (secure access)");
    await adminLogin(page, { mark }, narration["admin-login"]);

    console.log("3/8 — Create crisis");
    await chapterCreateCrisis(page, { mark });

    console.log("4/8 — Capture damage assessment");
    await chapterUserReport(page, { mark });

    console.log("5/8 — Display on map");
    await chapterDashboard(page, { mark });

    console.log("6/8 — Version history");
    await chapterVersionHistory(page, { mark });

    console.log("7/8 — Export data");
    await chapterExport(page, { mark });

    console.log("8/8 — Offline sync");
    await chapterOfflineSync(page, { mark });
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const webmPath = await video.path();
      const finalWebm = join(OUTPUT_DIR, "crisismap-full-demo.webm");
      if (existsSync(webmPath) && statSync(webmPath).size > 0) {
        try {
          renameSync(webmPath, finalWebm);
        } catch {
          copyFileSync(webmPath, finalWebm);
        }
        console.log(`\nVideo: ${finalWebm}`);
      } else {
        console.warn("\nWarning: recording file missing or empty — check disk space.");
      }
    }

    const cuesPath = join(OUTPUT_DIR, "cues.json");
    writeFileSync(cuesPath, JSON.stringify(cues, null, 2));
    console.log(`Cues:  ${cuesPath}`);
    console.log(`\nAdmin password used: ${ADMIN_PASSWORD}`);
    console.log("Next: npm run voiceover && npm run assemble");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
