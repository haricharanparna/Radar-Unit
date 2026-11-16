// Scout layouts before recording: screenshots of each screen we plan to film.
import { launch, SITE } from "./recorder.mjs";
import fs from "node:fs";
const OUT = "../recordings/scout"; fs.mkdirSync(OUT, { recursive: true });
const RESULT = process.env.RESULT ?? "2c4e1ba28297eba5";
const { browser, context } = await launch();
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text().slice(0, 200)); });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };

await page.goto(`${SITE}/`, { waitUntil: "networkidle" }); await page.waitForTimeout(2500); await shot("home");

await page.goto(`${SITE}/explore?result=${RESULT}`, { waitUntil: "networkidle" });
await page.getByText("What the radar saw at Mason Neck").first().waitFor({ timeout: 90000 });
await page.waitForTimeout(2000);
await page.getByText("What the radar saw at Mason Neck").first().scrollIntoViewIfNeeded(); await shot("summary");
const mapHead = page.getByText("See it on the map").first();
await mapHead.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 10));
await page.waitForTimeout(4000); await shot("map_compare");
await page.getByRole("button", { name: /Likely water/ }).first().click(); await page.waitForTimeout(3000); await shot("map_screening");
await page.getByRole("button", { name: /What changed/ }).first().click(); await page.waitForTimeout(3000); await shot("map_change");
await page.getByRole("button", { name: /Before and after/ }).first().click();
await page.getByRole("button", { name: /27 Jul → 20 Aug/ }).first().click(); await page.waitForTimeout(2000);
await page.getByLabel("Basemap").selectOption("nasa"); await page.waitForTimeout(1000);
await page.getByLabel("Radar layer opacity").fill("0.1"); await page.waitForTimeout(4000); await shot("map_nasa_clouds");
await page.getByLabel("Radar layer opacity").fill("1"); await page.waitForTimeout(2500); await shot("map_nasa_radar");
const ts = page.getByText("Echo strength on every pass").first();
await ts.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60)); await page.waitForTimeout(2000); await shot("timeseries");

await page.goto(`${SITE}/story?result=${RESULT}`, { waitUntil: "networkidle" }); await page.waitForTimeout(6000); await shot("story");
fs.writeFileSync(`${OUT}/story_text.txt`, await page.locator("body").innerText());

await page.goto(`${SITE}/explore`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Choose another place/i }).first().click();
const feed = page.getByText("Newest NISAR acquisitions worldwide").first();
await feed.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60));
await page.waitForTimeout(8000); await shot("globe");
await browser.close();
