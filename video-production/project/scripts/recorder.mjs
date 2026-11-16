// Genuine screen capture of the live DELTA PULSE app via the Chrome DevTools screencast.
// Frames are saved as high-quality JPEGs with their real timestamps, then turned into a
// constant-30fps MP4 with FFmpeg (each frame held until the next real frame arrived).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const SITE = "https://delta-pulse-nisar.vercel.app";
export const FFMPEG = process.env.FFMPEG ??
  path.join(process.env.LOCALAPPDATA, "Python/pythoncore-3.13-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe");

export async function launch() {
  const browser = await chromium.launch({
    channel: "msedge", // the locally installed Microsoft Edge (Chromium)
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "en-US",
    timezoneId: "America/New_York",
  });
  return { browser, context };
}

export async function startCapture(page, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(outDir, `f${String(n++).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch { /* closing */ }
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 93, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  return {
    async stop(mp4) {
      // keep the last frame on screen briefly so the clip does not end mid-frame
      await page.waitForTimeout(300);
      await cdp.send("Page.stopScreencast");
      const end = Date.now() / 1000;
      if (!frames.length) throw new Error("no frames captured");
      const list = frames.map((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : end;
        return `file '${path.basename(f.file)}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`;
      });
      list.push(`file '${path.basename(frames.at(-1).file)}'`);
      fs.writeFileSync(path.join(outDir, "list.txt"), list.join("\n"));
      execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
        "-vf", "scale=2560:1440:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "14",
        "-movflags", "+faststart", path.resolve(mp4)], { cwd: outDir });
      console.log(`  saved ${mp4}: ${frames.length} frames over ${(end - (frames[0]?.t ?? t0)).toFixed(1)} s`);
    },
  };
}

/** Smooth programmatic scroll (eased), so recordings have no jumps. */
export async function smoothScrollTo(page, y, ms = 1500) {
  await page.evaluate(async ({ y, ms }) => {
    const y0 = window.scrollY, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    await new Promise((res) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, y0 + (y - y0) * ease(t));
        t < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }, { y, ms });
}

/** Scroll so an element's top sits `offset` px below the top of the viewport. */
export async function scrollToEl(page, locator, offset = 70, ms = 1500) {
  const y = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await smoothScrollTo(page, Math.max(0, y), ms);
}
