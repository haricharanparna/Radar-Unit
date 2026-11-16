// Records every scene of the submission video from the LIVE DELTA PULSE app.
// Usage: node scripts/record.mjs [sceneName ...]   (no args = all scenes)
// Output: ../recordings/<scene>.mp4 (2560x1440, 30 fps). Raw frames go to ../recordings/_frames (deleted after).
import { launch, startCapture, SITE, scrollToEl, smoothScrollTo } from "./recorder.mjs";
import fs from "node:fs";

const RESULT = process.env.RESULT ?? "2c4e1ba28297eba5"; // live Mason Neck analysis computed 2026-11-16 02:13 UTC
const REC = "../recordings";
const FR = `${REC}/_frames${process.env.FRSUFFIX ?? ""}`;
const want = process.argv.slice(2);

async function openResult(page, path = "/explore") {
  await page.goto(`${SITE}${path}?result=${RESULT}`, { waitUntil: "networkidle" });
  await page.getByText(/Mason Neck/).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
}
async function toMap(page) {
  await scrollToEl(page, page.getByText("See it on the map").first(), 8, 10);
  await page.waitForTimeout(500);
  // the map's own loading overlay must be gone before we film it
  await page.getByText("Loading the map and radar layers").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
}
async function mapBox(page) {
  return page.getByLabel("Drag to compare before and after").locator("xpath=ancestor::div[contains(@class,'relative')][1]").boundingBox();
}
async function zoomMap(page, x, y, ticks, delta = -120, gap = 90) {
  await page.mouse.move(x, y);
  for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(gap); }
}
async function swipeHandleTo(page, presses, key = "ArrowLeft") {
  const h = page.getByLabel("Drag to compare before and after");
  await h.focus();
  for (let i = 0; i < presses; i++) await h.press(key);
  await h.blur();
}

const scenes = {
  // A + C: the real homepage (title, tagline, real NISAR image of Tonle Sap)
  async s01_home(page) {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await smoothScrollTo(page, 0, 10);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(9000);
    await cap.stop(`${REC}/s01_home.mp4`);
  },

  // B: same-UTC-day NASA optical (cloud) vs the NISAR radar pass of 13 Sep 2026, real app controls
  async s02_clouds_vs_radar(page) {
    await openResult(page);
    await toMap(page);
    await page.getByRole("button", { name: /1 Sept → 13 Sept/ }).first().click();
    await page.getByLabel("Basemap").selectOption("nasa");
    await swipeHandleTo(page, 25); // show the 13 Sep (after) pass across the map
    const b = await mapBox(page);
    await scrollToEl(page, page.getByRole("button", { name: /Likely water/ }).first(), 12, 10);
    await page.waitForTimeout(800);
    const b2 = await mapBox(page); Object.assign(b, b2);
    await zoomMap(page, b.x + b.width * 0.36, b.y + b.height * 0.55, 3);
    const op = page.getByLabel("Radar layer opacity");
    await op.focus(); await op.press("Home"); await op.blur();
    await page.mouse.move(b.x + b.width - 5, b.y + 5);
    await page.waitForTimeout(6000); // tiles
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(3500);
    await op.focus();
    for (let i = 0; i < 18; i++) { await op.press("ArrowRight"); await page.waitForTimeout(65); } // the real opacity slider, 10% -> 100%
    await op.blur();
    await page.waitForTimeout(4500);
    await cap.stop(`${REC}/s02_clouds_vs_radar.mp4`);
  },

  // D: real search -> real archive listing -> analyse -> result (re-opened from the app's saved-result cache)
  async s03_search(page) {
    await page.goto(`${SITE}/explore`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Choose another place/i }).first().click();
    await page.waitForTimeout(600);
    const input = page.getByLabel("Place name or coordinates");
    await scrollToEl(page, input, 260, 10);
    await page.waitForTimeout(800);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(600);
    await input.click();
    await input.pressSequentially("Mason Neck, Virginia", { delay: 55 });
    await page.waitForTimeout(300);
    await input.press("Enter");
    // Nominatim may return one match (auto-picked) or a list; pick the Mason Neck peninsula entry if listed
    for (let k = 0; k < 60; k++) {
      if (await page.getByText(/GCOV granules/).count()) break;
      const opt = page.getByRole("button", { name: /Mason Neck.*38\.65/ });
      if (await opt.count()) { await opt.first().click(); break; }
      if (k === 10) await page.screenshot({ path: `${REC}/scout/s03_geocode.png` });
      await page.waitForTimeout(500);
    }
    await page.getByText(/GCOV granules/).first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1600);
    // the 10-pass provisional stack (track 98D, frame 69, P05023) that the Mason Neck result was computed from
    await page.getByRole("button", { name: /Track 98D.*frame 69.*PROVISIONAL P05023.*10 dates/ }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /select all/i }).first().click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /^Analyse \d+ acquisition/ }).click();
    for (let k = 0; ; k++) {
      if (await page.getByText(/What the radar saw at Mason Neck/).count()) break;
      if (k % 20 === 0) { await page.screenshot({ path: `${REC}/scout/s03_wait_${k}.png` }); console.log("  waiting", k / 2, "s:", (await page.getByRole("progressbar").first().getAttribute("aria-valuenow").catch(() => "?"))); }
      if (k > 1200) throw new Error("analysis did not finish in 10 min");
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1200);
    await scrollToEl(page, page.getByText(/What the radar saw at Mason Neck/).first(), 30, 1600);
    await page.waitForTimeout(3500);
    await cap.stop(`${REC}/s03_search.mp4`);
  },

  // D: the real cyan/amber "Likely water" screening map, zooming into the radar strip
  async s04_water_map(page) {
    await openResult(page);
    await toMap(page);
    await page.getByRole("button", { name: /Likely water/ }).first().click();
    await page.getByLabel("Basemap").selectOption("dark");
    await scrollToEl(page, page.getByRole("button", { name: /Likely water/ }).first(), 12, 10);
    await page.waitForTimeout(800);
    const b = await mapBox(page);
    await page.mouse.move(b.x + b.width - 5, b.y + 5);
    await page.waitForTimeout(5000);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(1200);
    await zoomMap(page, b.x + b.width * 0.42, b.y + b.height * 0.5, 10, -60, 160);
    await page.mouse.move(b.x + b.width - 5, b.y + 5);
    await page.waitForTimeout(3500);
    await cap.stop(`${REC}/s04_water_map.mp4`);
  },

  // E: the real summary cards (+38% water under trees, 28 -> 39 km²)
  async s05_summary(page) {
    await openResult(page);
    await scrollToEl(page, page.getByText(/What the radar saw at Mason Neck/).first(), 30, 10);
    await page.waitForTimeout(1500);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(2000);
    await scrollToEl(page, page.getByText("Under vegetation").first(), 150, 1800);
    await page.waitForTimeout(3500);
    await cap.stop(`${REC}/s05_summary.mp4`);
  },

  // E/F: Your Story for Mason Neck: cover, then playing (documentary mode), plus chapter 3 (water per pass)
  async s06_story(page) {
    await openResult(page, "/story");
    await page.waitForTimeout(3000);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /Begin the story/ }).first().click();
    await page.waitForTimeout(16000);
    await cap.stop(`${REC}/s06_story_play.mp4`);
  },
  async s06b_story_chapters(page) {
    await openResult(page, "/story");
    await page.waitForTimeout(2500);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(800);
    await scrollToEl(page, page.locator("#s-sky"), 64, 1600);
    await page.waitForTimeout(3200);
    await scrollToEl(page, page.locator("#s-radar"), 64, 1600);
    await page.waitForTimeout(4500);
    await cap.stop(`${REC}/s06b_story_chapters.mp4`);
  },
  async s07_story_water(page) {
    await openResult(page, "/story");
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.getElementById("s-water")?.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -400));
    await page.waitForTimeout(1500);
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(500);
    await scrollToEl(page, page.locator("#s-water"), 64, 1200);
    await page.waitForTimeout(1500);
    await scrollToEl(page, page.getByText("39 km²").first(), 560, 1800);
    await page.waitForTimeout(6000);
    await cap.stop(`${REC}/s07_story_water.mp4`);
  },

  // F: the real 3D globe of the newest NISAR acquisitions worldwide
  async s08_globe(page) {
    await page.goto(`${SITE}/explore`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Choose another place/i }).first().click();
    const feed = page.getByText("Newest NISAR acquisitions worldwide").first();
    await scrollToEl(page, feed, 70, 10);
    await page.getByText("Loading the newest acquisitions").waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    await page.getByRole("button", { name: "7 days" }).click();
    await page.getByText("Loading the newest acquisitions").waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(7000);
    const gb = await page.getByText("Basemap: Esri").last().locator("xpath=ancestor::div[contains(@class,'relative')][1]").boundingBox();
    const cap = await startCapture(page, FR);
    await page.waitForTimeout(2500); // the globe's own slow spin
    const cx = gb.x + gb.width / 2, cy = gb.y + gb.height / 2;
    await page.mouse.move(cx + 120, cy); await page.mouse.down();
    for (let i = 0; i <= 60; i++) { await page.mouse.move(cx + 120 - i * 4, cy - Math.sin(i / 60 * Math.PI) * 20); await page.waitForTimeout(33); }
    await page.mouse.up();
    await page.mouse.move(gb.x + gb.width + 300, gb.y);
    await page.waitForTimeout(5000);
    await cap.stop(`${REC}/s08_globe.mp4`);
  },
};

const { browser, context } = await launch();
for (const [name, fn] of Object.entries(scenes)) {
  if (want.length && !want.includes(name)) continue;
  console.log("recording", name);
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("  console error:", m.text().slice(0, 160)); });
  try { await fn(page); } catch (e) {
    console.log("  FAILED", name, e.message.split("\n").slice(0, 3).join(" | "));
    await page.screenshot({ path: `${REC}/scout/fail_${name}.png` }).catch(() => {});
  }
  await page.close();
}
await browser.close();
fs.rmSync(FR, { recursive: true, force: true });
