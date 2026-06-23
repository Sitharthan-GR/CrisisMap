/** Shared helpers for demo video recording. */

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
export const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
export const CRISIS_NAME =
  process.env.DEMO_CRISIS_NAME ?? "East Tennessee Storm 2026";
export const FORM_TEMPLATE_NAME =
  process.env.DEMO_FORM_NAME ?? "Storm Damage Checklist";

/** Istanbul Karaköy stack — latest version (v3) from seed data. */
export const ISTANBUL_HISTORY_REPORT_ID =
  "e4098070-dd6b-4a6d-87cf-1d6079bbd2d8";

export function createCueLogger() {
  const cues = [];
  let start = 0;

  return {
    cues,
    start() {
      start = Date.now();
    },
    mark(id, text) {
      cues.push({ id, text, at_ms: Date.now() - start });
    },
  };
}

export const TIMING = {
  /** Playwright delay between actions (higher = slower, more deliberate). */
  slowMo: 150,
  /** Scale all pause() durations. */
  pauseScale: 1.2,
  /** Hard cap for final MP4 length (seconds). */
  maxSeconds: 118,
};

export async function pause(page, ms = 1800) {
  await page.waitForTimeout(Math.round(ms * TIMING.pauseScale));
}

export async function removeOverlay(page) {
  await page.evaluate(() => {
    document.getElementById("demo-overlay")?.remove();
    document.getElementById("demo-caption")?.remove();
  });
}

export async function showOverlay(page, html, position = "top-right") {
  const positions = {
    "top-right": "top:72px;right:24px;",
    "top-center": "top:72px;left:50%;transform:translateX(-50%);",
    "bottom-center": "bottom:32px;left:50%;transform:translateX(-50%);",
  };

  await page.evaluate(
    ({ content, posStyle }) => {
      let el = document.getElementById("demo-overlay");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-overlay";
        document.body.appendChild(el);
      }
      el.style.cssText = `
        position:fixed;${posStyle}
        z-index:99999;
        background:rgba(8,12,20,0.92);
        color:#f8fafc;
        padding:14px 20px;
        border-radius:12px;
        font:600 17px/1.4 system-ui,-apple-system,sans-serif;
        border:2px solid #3b82f6;
        box-shadow:0 8px 32px rgba(0,0,0,0.45);
        max-width:420px;
        pointer-events:none;
      `;
      el.innerHTML = content;
    },
    { content: html, posStyle: positions[position] ?? positions["top-right"] },
  );
}

export async function showCaption(page, text) {
  await page.evaluate((caption) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      document.body.appendChild(el);
    }
    el.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      z-index:99998;
      background:rgba(8,12,20,0.88);
      color:#e2e8f0;
      padding:10px 22px;
      border-radius:999px;
      font:500 15px system-ui,-apple-system,sans-serif;
      border:1px solid rgba(59,130,246,0.5);
      pointer-events:none;
      white-space:nowrap;
    `;
    el.textContent = caption;
  }, text);
}

export async function showPasswordOverlay(page) {
  await showOverlay(
    page,
  `<div style="font-size:13px;font-weight:500;color:#94a3b8;margin-bottom:6px">Admin password</div>
   <div style="font-size:26px;font-weight:800;letter-spacing:0.04em;color:#60a5fa">admin123</div>`,
    "top-center",
  );
}

export async function searchAndPickPlace(page, query) {
  const searchInput = page.getByPlaceholder(
    "Type address, place, or building name",
  );
  await searchInput.click();
  await searchInput.fill("");
  await searchInput.fill(query);
  await page.waitForTimeout(1400);
  const result = page.locator("ul button").filter({ hasText: /./ }).first();
  await result.waitFor({ state: "visible", timeout: 20000 });
  await result.click();
  await page.waitForTimeout(900);
}

export async function fillReportWizard(
  page,
  { locationQuery, description, offline = false },
) {
  await page.getByText("How damaged is the structure?").waitFor({ timeout: 20000 });
  await page.locator(".report-wizard-option").filter({ hasText: "Partial" }).click();
  await pause(page, 900);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator(".report-wizard-option").filter({ hasText: "Residential" }).click();
  await pause(page, 900);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator(".report-wizard-option").filter({ hasText: "Flood" }).click();
  await pause(page, 900);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /No.*Site is clear/i }).click();
  await pause(page, 900);
  await page.getByRole("button", { name: "Continue" }).click();

  if (offline) {
    await page.getByRole("button", { name: /Use my GPS/i }).click();
    await pause(page, 1800);
  } else {
    await searchAndPickPlace(page, locationQuery);
  }
  await pause(page, 1100);
  await page.getByRole("button", { name: "Continue" }).click();

  await page
    .getByPlaceholder("Leave blank to report anonymously")
    .fill("Alex Morgan");
  if (description) {
    await page.locator("textarea").fill(description);
  }
  await pause(page, 1100);

  await page.getByRole("button", { name: "Submit report" }).click();
  if (offline) {
    await page.getByText("Report saved on this device").waitFor({ timeout: 30000 });
  } else {
    await page.getByText("Report submitted").waitFor({ timeout: 45000 });
  }
}

export async function adminLogin(page, cue, loginNarration) {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await pause(page, 1200);
  if (cue && loginNarration) {
    cue.mark("admin-login", loginNarration);
  }

  const passwordInput = page.locator(".admin-login-card input").first();
  const newCrisisBtn = page.getByRole("button", { name: "New crisis" });

  if (await newCrisisBtn.isVisible().catch(() => false)) {
    return;
  }

  await passwordInput.waitFor({ state: "visible", timeout: 25000 });
  await showPasswordOverlay(page);
  await pause(page, 1500);

  await passwordInput.evaluate((el) => {
    el.type = "text";
  });
  await passwordInput.click();
  await passwordInput.fill(ADMIN_PASSWORD);
  await pause(page, 1200);

  await page.getByRole("button", { name: "Sign in" }).click();
  await newCrisisBtn.waitFor({ state: "visible", timeout: 25000 });
  await removeOverlay(page);
  await pause(page, 1200);
}
