import {spawn, spawnSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium, devices} from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESULTS_ROOT = join(ROOT, "tests", "perf", "results");

const SCENARIOS = {
  menu: {wave: null, label: "main menu / idle", preWarmup: false},
  early: {wave: 1, label: "early-wave combat (wave 1)", preWarmup: true},
  boss: {wave: 3, label: "boss combat (wave 3)", preWarmup: false},
  endless: {wave: 5, label: "endless combat (wave 5)", preWarmup: false},
};

const PROFILES = {
  pc: {
    context: {
      viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1,
    }, throttle: 1,
  }, phone: {
    context: {...devices["Pixel 7"]}, throttle: null,
  },
};

const MAX_ATTEMPTS = 3;
const ABILITY_INTERVAL_MS = 2_000;
const NEXT_SAMPLE_MS = 1_000;
const TICK_MS = 200;
const DRAFT_CLICK_DELAY_MS = 500;
const ORBIT_RADIUS_FRACTION = 0.36;
const ORBIT_ANGULAR_SPEED = 0.25;
const THROTTLE_ARTIFACT_FPS = 2;
const THROTTLE_ARTIFACT_WORK_MS = 50;
const CAPTURE_GRACE_MS = 5_000;

const LAUNCH_ARGS = ["--autoplay-policy=no-user-gesture-required", "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",];

function parseArgs(argv) {
  const options = {
    profiles: ["pc", "phone"],
    scenarios: ["menu", "early", "boss", "endless"],
    classes: ["pusher"],
    repeats: 3,
    warmupMs: 60_000,
    captureMs: 60_000,
    throttle: 6,
    url: null,
    port: 4173,
    serve: true,
    build: true,
    headed: true,
    invincible: true,
    quality: null,
    tag: null,
  };
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw ?? "true";
    switch (key) {
      case "profiles":
        options.profiles = value.split(",");
        break;
      case "scenarios":
        options.scenarios = value.split(",");
        break;
      case "classes":
        options.classes = value.split(",");
        break;
      case "repeats":
        options.repeats = Number.parseInt(value, 10);
        break;
      case "warmup":
        options.warmupMs = Math.round(Number(value) * 1000);
        break;
      case "capture":
        options.captureMs = Math.round(Number(value) * 1000);
        break;
      case "throttle":
        options.throttle = Number(value);
        break;
      case "url":
        options.url = value.replace(/\/+$/, "");
        options.serve = false;
        break;
      case "port":
        options.port = Number.parseInt(value, 10);
        break;
      case "serve":
        options.serve = value !== "false";
        break;
      case "build":
        options.build = value !== "false";
        break;
      case "headless":
        options.headed = value !== "true";
        break;
      case "invincible":
        options.invincible = value !== "false";
        break;
      case "quality":
        options.quality = value;
        break;
      case "tag":
        options.tag = value;
        break;
      default:
        break;
    }
  }
  return options;
}

function log(message) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[${stamp}] ${message}`);
}

function sleep(ms) {
  return new Promise((fulfill) => setTimeout(fulfill, ms));
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(3_000)});
      if (response.ok) return true;
    } catch {
      // server not up yet
    }
    await sleep(500);
  }
  return false;
}

function startServer(port) {
  const child = spawn(`npx vite preview --port ${port} --strictPort`, {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  },);
  child.stdout.on("data", () => {
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

function killServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

function buildGame() {
  log("Building production bundle...");
  const result = spawnSync("npm run build", {
    cwd: ROOT, shell: true, stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("npm run build failed");
}

function parsePanel(text) {
  if (!text || !text.includes("Performance profile")) return null;
  const fps = /^FPS: ([\d.]+) avg \/ ([\d.]+) ms p95$/m.exec(text);
  const status = /^(Collecting 60-second baseline|Within 30 FPS budget|Below 30 FPS budget) \(60-second rolling average\)$/m.exec(text);
  if (!fps || !status) return null;
  const work = /^JS update \+ render submission: ([\d.]+) ms avg \/ ([\d.]+) ms last$/m.exec(text);
  const draw = /^Draw calls: (\d+) \| triangles: (\d+)$/m.exec(text);
  const enemies = /^Enemies alive: (\d+)$/m.exec(text);
  const geometries = /^Geometries: (\d+) \| textures: (\d+) \| (.+)$/m.exec(text);
  const quality = /^Quality: (\w+) \| DPR cap ([\d.]+) \| shadow map (\d+)( \(off\))? \| steps (\d+)$/m.exec(text,);
  const device = /^Device: (.+)$/m.exec(text);
  const viewport = /^Viewport: (\d+)×(\d+) CSS · DPR ([\d.]+)$/m.exec(text);
  const statusKey = status[1] === "Collecting 60-second baseline" ? "collecting" : status[1].startsWith("Within") ? "within" : "below";
  return {
    fps: Number(fps[1]),
    p95: Number(fps[2]),
    status: statusKey,
    workAvg: work ? Number(work[1]) : null,
    workLast: work ? Number(work[2]) : null,
    draws: draw ? Number(draw[1]) : null,
    triangles: draw ? Number(draw[2]) : null,
    enemies: enemies ? Number(enemies[1]) : null,
    geometries: geometries ? Number(geometries[1]) : null,
    textures: geometries ? Number(geometries[2]) : null,
    heap: geometries ? geometries[3] : null,
    quality: quality ? quality[1] : null,
    dprCap: quality ? Number(quality[2]) : null,
    shadowMapSize: quality ? Number(quality[3]) : null,
    shadowsEnabled: quality ? !quality[4] : null,
    qualitySteps: quality ? Number(quality[5]) : null,
    device: device ? device[1] : null,
    viewport: viewport ? `${viewport[1]}x${viewport[2]}@${viewport[3]}` : null,
  };
}

function hasOverlay(page, selector) {
  return page
    .evaluate((target) => !!document.querySelector(`.overlay.visible ${target}`), selector,)
    .catch(() => false);
}

async function runOnce(browser, options, profileName, scenarioName, className, repeat, sessionDir,) {
  const profile = PROFILES[profileName];
  const scenario = SCENARIOS[scenarioName];
  const throttle = profile.throttle === null ? options.throttle : profile.throttle;

  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  if (throttle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", {rate: throttle});
  }

  const query = new URLSearchParams({profile: "1"});
  if (scenario.wave !== null) {
    query.set("wave", String(scenario.wave));
    query.set("class", className);
    if (options.invincible) query.set("invincible", "1");
  }
  if (options.quality) query.set("quality", options.quality);
  const url = `${options.url}/?${query.toString()}`;

  const result = {
    profile: profileName,
    scenario: scenarioName,
    scenarioLabel: scenario.label,
    className: scenario.wave === null ? null : className,
    repeat,
    url,
    throttle,
    invincible: options.invincible && scenario.wave !== null,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    valid: false,
    reason: null,
    sampleCount: 0,
    maxEnemies: 0,
    deaths: 0,
    drafts: 0,
    draftTimes: [],
    final: null,
    errors: [],
  };

  try {
    if (scenario.preWarmup) {
      const menuQuery = new URLSearchParams({profile: "1"});
      if (options.quality) menuQuery.set("quality", options.quality);
      const menuUrl = `${options.url}/?${menuQuery.toString()}`;
      log(`  warmup page (${Math.round(options.warmupMs / 1000)}s)`);
      await page.goto(menuUrl, {
        waitUntil: "domcontentloaded", timeout: 60_000,
      });
      await page.waitForSelector("#perf-profile", {timeout: 120_000});
      await page.waitForFunction(() => document
        .getElementById("loading-message")
        ?.classList.contains("hidden"), {timeout: 180_000},);
      if (options.headed) await page.bringToFront();
      await sleep(options.warmupMs);
    }

    log(`  navigate ${url}`);
    await page.goto(url, {waitUntil: "domcontentloaded", timeout: 60_000});
    await page.waitForSelector("#perf-profile", {timeout: 120_000});
    await page.waitForFunction(() => document
      .getElementById("loading-message")
      ?.classList.contains("hidden"), {timeout: 180_000},);
    if (options.headed) await page.bringToFront();

    const size = page.viewportSize();
    const center = {x: size.width / 2, y: size.height / 2};
    const radius = Math.round(Math.min(size.width, size.height) * ORBIT_RADIUS_FRACTION,);
    const interactive = scenario.wave !== null;
    const abilityEnabled = interactive && className !== "anchor";
    const inRunWarmupMs = scenario.preWarmup ? 0 : options.warmupMs;

    await page.mouse.click(center.x, center.y);
    await sleep(600);

    const startedAt = Date.now();
    const totalMs = inRunWarmupMs + options.captureMs + CAPTURE_GRACE_MS;
    const samples = [];
    let maxEnemies = 0;
    let angle = 0;
    let nextAbilityAt = startedAt + ABILITY_INTERVAL_MS;
    let nextSampleAt = startedAt;
    let lastTickAt = startedAt;
    let draftOpen = false;

    while (Date.now() - startedAt < totalMs) {
      const now = Date.now();
      const tickDelta = now - lastTickAt;
      lastTickAt = now;

      if (interactive) {
        angle += (ORBIT_ANGULAR_SPEED * tickDelta) / 1000;
        const x = Math.round(center.x + radius * Math.cos(angle));
        const y = Math.round(center.y + radius * Math.sin(angle));
        await page.mouse.move(x, y).catch(() => {
        });
        if (abilityEnabled && now >= nextAbilityAt) {
          nextAbilityAt = now + ABILITY_INTERVAL_MS;
          await page.mouse.dblclick(x, y).catch(() => {
          });
        }
        const draftVisible = await hasOverlay(page, ".draft-panel");
        if (draftVisible && !draftOpen) {
          draftOpen = true;
          result.drafts += 1;
          result.draftTimes.push(Date.now() - startedAt);
          await sleep(DRAFT_CLICK_DELAY_MS);
          await page
            .locator(".overlay.visible .draft-card")
            .first()
            .click({timeout: 5_000})
            .catch(() => {
            });
        } else if (!draftVisible) {
          draftOpen = false;
        }
        if (await hasOverlay(page, ".gameover-panel")) {
          result.deaths += 1;
          result.reason = "player died";
          break;
        }
      }

      const elapsed = Date.now() - startedAt;
      if (now >= nextSampleAt) {
        nextSampleAt = now + NEXT_SAMPLE_MS;
        const text = await page
          .evaluate(() => document.getElementById("perf-profile")?.textContent ?? "",)
          .catch(() => "");
        const parsed = parsePanel(text);
        if (parsed) {
          parsed.t = elapsed;
          parsed.phase = elapsed < inRunWarmupMs ? "warmup" : "capture";
          samples.push(parsed);
          if (typeof parsed.enemies === "number") {
            maxEnemies = Math.max(maxEnemies, parsed.enemies);
          }
        }
      }

      await page.waitForTimeout(TICK_MS);
    }

    result.durationMs = Date.now() - startedAt;
    result.sampleCount = samples.length;
    result.maxEnemies = maxEnemies;

    const captureSamples = samples.filter((sample) => sample.phase === "capture",);
    const final = captureSamples.at(-1) ?? samples.at(-1) ?? null;
    result.final = final;

    if (!result.reason) {
      const finalWork = Number.isFinite(final?.workAvg) ? final.workAvg : null;
      const lightFrameWork = finalWork === null || finalWork < THROTTLE_ARTIFACT_WORK_MS;
      if (!final) {
        result.reason = "no profiler samples";
      } else if (final.status === "collecting" && lightFrameWork) {
        result.reason = "60-second window never completed (visibility?)";
      } else if (final.fps < THROTTLE_ARTIFACT_FPS && lightFrameWork) {
        result.reason = "implausibly low FPS with light frame work (rendering throttled?)";
      } else {
        result.valid = true;
        if (final.status === "collecting") {
          result.note = "window incomplete but heavy frame work confirms slowdown";
        }
      }
    }

    const baseName = `${profileName}__${scenarioName}__${className}__r${repeat}`;
    const jsonlPath = join(sessionDir, "runs", `${baseName}.jsonl`);
    writeFileSync(jsonlPath, samples.map((sample) => JSON.stringify(sample)).join("\n"),);
  } catch (error) {
    result.reason = `error: ${error.message}`;
  } finally {
    result.errors = errors.slice(0, 30);
    await context.close().catch(() => {
    });
  }

  return result;
}

async function runWithRetries(browser, options, profileName, scenarioName, className, repeat, sessionDir,) {
  const attempts = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await runOnce(browser, options, profileName, scenarioName, className, repeat, sessionDir,);
    attempts.push(result);
    if (result.valid) break;
    log(`  attempt ${attempt} invalid (${result.reason}), retrying...`,);
  }
  const representative = attempts.at(-1);
  representative.attempts = attempts.length;
  representative.attemptSummaries = attempts.map((attempt) => ({
    valid: attempt.valid,
    reason: attempt.reason,
    deaths: attempt.deaths,
    durationMs: attempt.durationMs,
    attemptErrors: attempt.errors.length,
  }));

  const baseName = `${profileName}__${scenarioName}__${className}__r${repeat}`;
  writeFileSync(join(sessionDir, "runs", `${baseName}.json`), JSON.stringify(representative, null, 2),);

  if (representative.valid && representative.final) {
    const final = representative.final;
    const texturePart = final.textures ? `, textures ${final.textures}` + (representative.maxEnemies > 0 ? ` (${(final.textures / representative.maxEnemies).toFixed(1)}/alive)` : "") : "";
    const qualityPart = final.quality ? `, quality ${final.quality}${final.qualitySteps > 0 ? ` (${final.qualitySteps} steps)` : ""}` : "";
    log(`  done: ${final.fps.toFixed(1)} FPS avg, p95 ${final.p95.toFixed(1)} ms, ` + `JS ${final.workAvg?.toFixed(1) ?? "?"} ms, draws ${final.draws}, ` + `max enemies ${representative.maxEnemies}${texturePart}${qualityPart}, attempts ${representative.attempts}` + (representative.note ? ` [${representative.note}]` : ""),);
  } else {
    log(`  FAILED after ${MAX_ATTEMPTS} attempts (${representative.reason})`);
  }
  return representative;
}

function formatSummary(sessionDir, options, results, commandLine) {
  const lines = [];
  lines.push("# Performance session");
  lines.push("");
  lines.push(`- Command: \`${commandLine}\``);
  lines.push(`- Profiles: ${options.profiles.join(", ")}`);
  lines.push(`- Scenarios: ${options.scenarios.join(", ")}`);
  lines.push(`- Classes: ${options.classes.join(", ")}`);
  lines.push(`- Repeats: ${options.repeats}`);
  lines.push(`- Warmup: ${options.warmupMs / 1000}s, capture: ${options.captureMs / 1000}s`,);
  lines.push(`- Phone CPU throttle: ${options.throttle}x`);
  lines.push(`- Quality override: ${options.quality ?? "auto"}`);
  lines.push(`- Combat captures use \`&invincible=1\`: ${options.invincible}`,);
  lines.push(`- Server: ${options.url ?? `vite preview :${options.port}`}`);
  lines.push("");
  lines.push("| Profile | Scenario | Class | Run | Avg FPS | p95 ms | JS avg ms | Draw calls | Triangles | Max enemies | Geometries | Textures | Tex/alive | Heap | Status | Attempts | Viewport |",);
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |",);
  for (const result of results) {
    const final = result.final ?? {};
    const texAlive = final.textures && result.maxEnemies > 0 ? (final.textures / result.maxEnemies).toFixed(1) : "-";
    lines.push(`| ${result.profile} | ${result.scenario} | ${result.className ?? "-"} | ${result.repeat} | ` + `${final.fps?.toFixed(1) ?? "-"} | ${final.p95?.toFixed(1) ?? "-"} | ` + `${final.workAvg?.toFixed(1) ?? "-"} | ${final.draws ?? "-"} | ${final.triangles ?? "-"} | ` + `${result.maxEnemies} | ${final.geometries ?? "-"} | ${final.textures ?? "-"} | ${texAlive} | ${final.heap ?? "-"} | ` + `${result.valid ? `${final.status}${result.note ? ` (${result.note})` : ""}` : `invalid (${result.reason})`} | ${result.attempts ?? 1} | ` + `${final.viewport ?? "-"} |`,);
  }
  lines.push("");
  const textureRatios = results
    .filter((result) => result.valid && result.final?.textures && result.maxEnemies > 0)
    .map((result) => result.final.textures / result.maxEnemies);
  if (textureRatios.length > 0) {
    lines.push(`- Max textures/alive-enemy ratio: ${Math.max(...textureRatios).toFixed(1)} ` + `(a per-spawn skeleton leak reads far above 10; healthy ≈5–7 including baseline)`,);
  }
  lines.push("");
  const devices = new Set(results.map((result) => result.final?.device).filter(Boolean),);
  for (const device of devices) lines.push(`Device reported: ${device}`);
  return lines.join("\n");
}

async function main() {
  const commandLine = `node tests/perf/run-perf.mjs ${process.argv.slice(2).join(" ")}`.trim();
  const options = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
  const sessionDir = join(RESULTS_ROOT, `${stamp}${options.tag ? `-${options.tag}` : ""}`,);
  mkdirSync(join(sessionDir, "runs"), {recursive: true});

  if (!options.url) {
    options.url = `http://localhost:${options.port}`;
  }

  if (options.build) buildGame();

  let server = null;
  if (options.serve) {
    log(`Starting vite preview on port ${options.port}...`);
    server = startServer(options.port);
    const ready = await waitForServer(options.url, 60_000);
    if (!ready) {
      killServer(server);
      throw new Error(`Server did not become ready at ${options.url}`);
    }
    log("Server ready.");
  } else if (!(await waitForServer(options.url, 5_000))) {
    throw new Error(`No server reachable at ${options.url}`);
  }

  const jobs = [];
  for (const profileName of options.profiles) {
    for (const scenarioName of options.scenarios) {
      const scenario = SCENARIOS[scenarioName];
      if (!scenario) throw new Error(`Unknown scenario: ${scenarioName}`);
      const classes = scenario.wave === null ? ["default"] : options.classes;
      for (const className of classes) {
        for (let repeat = 1; repeat <= options.repeats; repeat++) {
          jobs.push({profileName, scenarioName, className, repeat});
        }
      }
    }
  }

  const perRunMs = options.warmupMs + options.captureMs + 15_000;
  log(`Planned ${jobs.length} runs, ~${Math.round((jobs.length * perRunMs) / 60_000)} minutes plus overhead.`,);

  const browser = await chromium.launch({
    channel: "chrome", headless: !options.headed, args: LAUNCH_ARGS,
  });

  const results = [];
  try {
    for (const job of jobs) {
      log(`Run ${results.length + 1}/${jobs.length}: ${job.profileName} / ${job.scenarioName} / ${job.className} / repeat ${job.repeat}`,);
      const result = await runWithRetries(browser, options, job.profileName, job.scenarioName, job.className, job.repeat, sessionDir,);
      results.push(result);
    }
  } finally {
    await browser.close().catch(() => {
    });
    killServer(server);
  }

  writeFileSync(join(sessionDir, "summary.md"), formatSummary(sessionDir, options, results, commandLine),);
  const failed = results.filter((result) => !result.valid).length;
  log(`Session complete: ${results.length - failed}/${results.length} valid.`);
  log(`Results: ${sessionDir}`);

  const latest = join(ROOT, "tests", "perf", "results", "latest.txt");
  writeFileSync(latest, JSON.stringify({sessionDir, commandLine}, null, 2));

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
