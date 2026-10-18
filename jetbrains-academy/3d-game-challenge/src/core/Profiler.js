import {getAliveCount} from "../entities/Enemy.js";
import {getQualityState} from "./Quality.js";

const TARGET_FPS = 30;
const PROFILE_WINDOW_MS = 60_000;
const HISTORY_GRACE_MS = 1_000;
const REPORT_INTERVAL_MS = 500;

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function compactUserAgent() {
  const ua = navigator.userAgent;
  const platform =
    ua.match(/Android \d+/)?.[0] ??
    ua.match(/Windows NT [\d.]+/)?.[0] ??
    ua.match(/Mac OS X [\d_.]+/)?.[0] ??
    (ua.includes("Linux") ? "Linux" : "Unknown OS");
  const browser =
    ua.match(/(?:Chrome|CriOS|EdgA|Edg|Firefox|FxiOS|Version)\/[\d.]+/)?.[0] ?? "";
  return [platform, browser].filter(Boolean).join(" · ");
}

function formatDevice(data) {
  const list = data.fullVersionList ?? [];
  const browser =
    list.find((entry) => /Chrome|Edg/.test(entry.brand)) ??
    list.find((entry) => !/Not.A.Brand/.test(entry.brand));
  const parts = [];
  if (data.model) {
    parts.push(data.model);
    if (data.platformVersion) {
      parts.push(`Android ${data.platformVersion.split(".")[0]}`);
    }
  } else if (navigator.userAgentData?.platform) {
    parts.push(navigator.userAgentData.platform);
  }
  if (browser) parts.push(`${browser.brand} ${browser.version}`);
  return parts.join(" · ") || compactUserAgent();
}

function describeDevice() {
  let text = compactUserAgent();
  const highEntropy = navigator.userAgentData?.getHighEntropyValues;
  if (highEntropy) {
    navigator.userAgentData
      .getHighEntropyValues(["model", "platformVersion", "fullVersionList"])
      .then((data) => {
        text = formatDevice(data);
      })
      .catch(() => {
      });
  }
  return () => text;
}

export function initProfiler(renderer) {
  const enabled = new URLSearchParams(window.location.search).get("profile");
  if (enabled !== "1") return null;

  const panel = document.createElement("pre");
  panel.id = "perf-profile";
  panel.setAttribute("aria-hidden", "true");
  panel.style.cssText = [
    "position:fixed",
    "left:8px",
    "top:8px",
    "z-index:1000",
    "max-width:min(360px,calc(100vw - 16px))",
    "margin:0",
    "padding:8px 10px",
    "border:1px solid rgba(255,255,255,.28)",
    "border-radius:8px",
    "background:rgba(5,10,16,.82)",
    "color:#f2f7fd",
    "font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace",
    "white-space:pre-wrap",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(panel);

  const samples = [];
  let lastReportAt = 0;
  let skipNextFrame = document.visibilityState !== "visible";
  const getDeviceText = describeDevice();
  document.addEventListener("visibilitychange", () => {
    skipNextFrame = true;
  });

  function recordFrame(frameDelta, workMs) {
    const now = performance.now();
    if (
      document.visibilityState === "visible" &&
      !skipNextFrame &&
      frameDelta > 0
    ) {
      samples.push({
        time: now,
        intervalMs: frameDelta * 1000,
        workMs,
      });
    }
    skipNextFrame = false;

    const historyCutoff = now - PROFILE_WINDOW_MS - HISTORY_GRACE_MS;
    while (samples.length > 0 && samples[0].time < historyCutoff) {
      samples.shift();
    }

    if (now - lastReportAt < REPORT_INTERVAL_MS) return;
    lastReportAt = now;

    const windowCutoff = now - PROFILE_WINDOW_MS;
    const windowSamples = samples.filter(
      (sample) => sample.time >= windowCutoff,
    );
    if (windowSamples.length === 0) return;

    const intervals = windowSamples.map((sample) => sample.intervalMs);
    const intervalTotal = intervals.reduce(
      (sum, interval) => sum + interval,
      0,
    );
    const averageFps = (windowSamples.length * 1000) / intervalTotal;
    const p95FrameMs = percentile(intervals, 0.95);
    const averageWorkMs =
      windowSamples.reduce((sum, sample) => sum + sample.workMs, 0) /
      windowSamples.length;
    const hasFullWindow = samples[0].time <= windowCutoff;
    const budgetStatus = !hasFullWindow
      ? "Collecting 60-second baseline"
      : averageFps >= TARGET_FPS
        ? "Within 30 FPS budget"
        : "Below 30 FPS budget";

    const renderInfo = renderer.info.render;
    const memoryInfo = renderer.info.memory;
    const usedHeapBytes = window.performance?.memory?.usedJSHeapSize;
    const heapText = Number.isFinite(usedHeapBytes)
      ? `${(usedHeapBytes / (1024 * 1024)).toFixed(1)} MB JS heap`
      : "JS heap unavailable";
    const quality = getQualityState();

    panel.textContent = [
      "Performance profile (?profile=1)",
      `FPS: ${averageFps.toFixed(1)} avg / ${p95FrameMs.toFixed(1)} ms p95`,
      `${budgetStatus} (60-second rolling average)`,
      `JS update + render submission: ${averageWorkMs.toFixed(1)} ms avg / ${workMs.toFixed(1)} ms last`,
      `Draw calls: ${renderInfo.calls} | triangles: ${renderInfo.triangles}`,
      `Enemies alive: ${getAliveCount()}`,
      `Geometries: ${memoryInfo.geometries} | textures: ${memoryInfo.textures} | ${heapText}`,
      `Quality: ${quality.tier} | DPR cap ${quality.dprCap} | shadow map ${quality.shadowMapSize}${quality.shadowsEnabled ? "" : " (off)"} | steps ${quality.steps}`,
      `Device: ${getDeviceText()}`,
      `Viewport: ${window.innerWidth}×${window.innerHeight} CSS · DPR ${window.devicePixelRatio}`,
    ].join("\n");
    panel.style.color =
      hasFullWindow && averageFps < TARGET_FPS ? "#ffb1b1" : "#f2f7fd";
  }

  return {recordFrame};
}
