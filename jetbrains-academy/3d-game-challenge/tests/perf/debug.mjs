import {chromium, devices} from "playwright";
import {mkdirSync} from "node:fs";
import {join} from "node:path";

const mode = process.argv[2] ?? "headed";
const profileName = process.argv[3] ?? "pc";
const baseUrl = (process.argv[4] ?? "http://localhost:5173").replace(/\/+$/, "");
const className = process.argv[5] ?? "pusher";
const seconds = Number.parseInt(process.argv[6] ?? "20", 10);
const outDir = join("tests", "perf", "debug", `${mode}-${profileName}`);
mkdirSync(outDir, {recursive: true});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const args = ["--autoplay-policy=no-user-gesture-required", "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",];

const browser = await chromium.launch({
  channel: "chrome", headless: mode === "headless", args,
});

const context = await browser.newContext(profileName === "phone" ? {...devices["Pixel 7"]} : {
  viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1,
},);
const page = await context.newPage();
await page.goto(`${baseUrl}/?profile=1&wave=1&class=${className}&invincible=1`,);
await page.waitForSelector("#perf-profile", {timeout: 60_000});
await page.waitForFunction(() => document.getElementById("loading-message")?.classList.contains("hidden"), {timeout: 120_000},);
if (mode === "headed") await page.bringToFront();

const gpu = await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});

const hz = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const loop = () => {
    frames += 1;
    const elapsed = performance.now() - start;
    if (elapsed >= 2000) resolve(Math.round((frames / elapsed) * 1000)); else requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}),);

console.log(JSON.stringify({
  mode, profileName, gpu, rafHz: hz, visibility: await page.evaluate(() => document.visibilityState),
}),);

const size = page.viewportSize();
const center = {x: size.width / 2, y: size.height / 2};
const radius = Math.round(Math.min(size.width, size.height) * 0.36);
const angularSpeed = 0.25;
const tickMs = 200;
let angle = 0;
let nextAbilityAt = Date.now() + 2_000;
const jumps = [];
const samples = [];
let draftOpen = false;

for (let elapsed = 0; elapsed <= seconds * 1_000; elapsed += tickMs) {
  const now = Date.now();
  angle += (angularSpeed * tickMs) / 1000;
  const x = Math.round(center.x + radius * Math.cos(angle));
  const y = Math.round(center.y + radius * Math.sin(angle));
  await page.mouse.move(x, y).catch(() => {
  });
  if (now >= nextAbilityAt) {
    nextAbilityAt = now + 2_000;
    await page.mouse.dblclick(x, y).catch(() => {
    });
  }
  const draftVisible = await page
    .evaluate(() => !!document.querySelector(".overlay.visible .draft-panel"))
    .catch(() => false);
  if (draftVisible && !draftOpen) {
    draftOpen = true;
    jumps.push(elapsed);
    await sleep(500);
    await page
      .locator(".overlay.visible .draft-card")
      .first()
      .click({timeout: 5_000})
      .catch(() => {
      });
  } else if (!draftVisible) {
    draftOpen = false;
  }
  if (await page.evaluate(() => !!document.querySelector(".overlay.visible .gameover-panel")).catch(() => false)) {
    console.log(`died at ~${elapsed / 1000}s`);
    break;
  }
  if (elapsed % 1_000 === 0) {
    const text = await page.evaluate(() => document.getElementById("perf-profile")?.textContent ?? "",);
    const fps = /^FPS: ([\d.]+) avg/m.exec(text);
    const enemies = /^Enemies alive: (\d+)$/m.exec(text);
    samples.push(`${elapsed / 1000}s: fps ${fps?.[1] ?? "?"} enemies ${enemies?.[1] ?? "?"}`,);
  }
  if (elapsed % 5_000 === 0) {
    await page.screenshot({
      path: join(outDir, `t${String(Math.round(elapsed / 1000)).padStart(3, "0")}.png`),
    });
  }
  await sleep(tickMs);
}

const panel = await page.evaluate(() => document.getElementById("perf-profile")?.textContent ?? "",);
const gameOver = await page.evaluate(() => !!document.querySelector(".overlay.visible .gameover-panel"),);
console.log(samples.join("\n"));
console.log(panel);
console.log(`draft appearances at: ${jumps.join(", ") || "none"}`);
console.log(`gameOver: ${gameOver}`);
console.log(`screenshots: ${outDir}`);

await browser.close();
process.exit(0);
