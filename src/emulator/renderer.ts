import { clamp, paletteFor } from "./color.js";
import { canvas, ctx, spectrumCanvas, spectrumCtx, ui } from "./dom.js";
import { activeSegment, audio, display, model } from "./model.js";

const DISPLAY_GAMMA = 0.72;
const DISPLAY_EXPOSURE = 1.6;
const BEAT_FLASH_MS = 220;

let lastBeatAt = 0;

export function draw() {
  resizeCanvas(canvas);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050605";
  ctx.fillRect(0, 0, width, height);
  if (display.diffuser) {
    ctx.globalCompositeOperation = "lighter";
  }

  const segments = model.state?.seg?.length ? model.state.seg : [activeSegment()];
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.45;
  const ringGap = maxRadius / Math.max(1, segments.length);
  const ledRadius = Math.max(3, Math.min(15, ringGap * 0.18));

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = Math.max(2, ringGap * 0.18);
  for (let ring = 0; ring < segments.length; ring += 1) {
    const radius = ring === 0 ? ringGap * 0.34 : ringGap * (ring + 0.54);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let ring = 0; ring < segments.length; ring += 1) {
    const segment = segments[ring];
    const start = segment.start || 0;
    const stop = Math.min(model.leds.length, segment.stop || start + segment.len || start + 1);
    const count = Math.max(1, stop - start);
    const radius = ring === 0 ? 0 : ringGap * (ring + 0.54);
    for (let offset = 0; offset < count; offset += 1) {
      const absoluteIndex = start + offset;
      const angle = -Math.PI / 2 + (offset / count) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      paintLed(x, y, ledRadius, model.leds[absoluteIndex]);
    }
  }

  if (display.diffuser) {
    ctx.globalCompositeOperation = "source-over";
    paintDiffuserVeil(width, height, maxRadius);
  }
}

export function drawSpectrum() {
  resizeCanvas(spectrumCanvas);
  const now = performance.now();
  if (audio.beat) lastBeatAt = now;
  const beatStrength = clamp(1 - (now - lastBeatAt) / BEAT_FLASH_MS, 0, 1);
  ui.beatIndicator.classList.toggle("active", beatStrength > 0);
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;
  const palette = paletteFor(activeSegment().pal);
  const ratio = window.devicePixelRatio || 1;
  const paddingX = 18 * ratio;
  const paddingTop = 18 * ratio;
  const labelHeight = 28 * ratio;
  const valueHeight = 18 * ratio;
  const plotLeft = paddingX;
  const plotTop = paddingTop + valueHeight;
  const plotWidth = Math.max(1, width - paddingX * 2);
  const plotHeight = Math.max(1, height - plotTop - labelHeight);
  const barGap = Math.max(3 * ratio, plotWidth * 0.004);
  const barWidth = Math.max(2 * ratio, plotWidth / audio.bins.length - barGap);

  spectrumCtx.clearRect(0, 0, width, height);
  spectrumCtx.fillStyle = "#050605";
  spectrumCtx.fillRect(0, 0, width, height);
  if (beatStrength > 0) drawBeatFlash(plotLeft, plotTop, plotWidth, plotHeight, beatStrength, ratio);

  spectrumCtx.strokeStyle = "rgba(255,255,255,0.08)";
  spectrumCtx.lineWidth = Math.max(1, ratio);
  for (let i = 0; i <= 4; i += 1) {
    const y = plotTop + plotHeight * (i / 4);
    spectrumCtx.beginPath();
    spectrumCtx.moveTo(plotLeft, y);
    spectrumCtx.lineTo(plotLeft + plotWidth, y);
    spectrumCtx.stroke();
  }

  spectrumCtx.textAlign = "center";
  spectrumCtx.textBaseline = "middle";
  spectrumCtx.font = `${11 * ratio}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

  for (let i = 0; i < audio.bins.length; i += 1) {
    const value = clamp(audio.bins[i], 0, 1);
    const x = plotLeft + i * (plotWidth / audio.bins.length) + barGap / 2;
    const barHeight = Math.max(2 * ratio, value * plotHeight);
    const y = plotTop + plotHeight - barHeight;
    const color = palette(i / audio.bins.length, 1);
    const gradient = spectrumCtx.createLinearGradient(0, y, 0, plotTop + plotHeight);
    gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 1)`);
    gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.38)`);
    spectrumCtx.fillStyle = gradient;
    spectrumCtx.fillRect(x, y, barWidth, barHeight);
    spectrumCtx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.22)`;
    spectrumCtx.fillRect(x, plotTop + plotHeight - 2 * ratio, barWidth, 2 * ratio);

    const centerX = x + barWidth / 2;
    spectrumCtx.fillStyle = "rgba(241,245,239,0.78)";
    spectrumCtx.fillText(value.toFixed(2), centerX, paddingTop);
    spectrumCtx.fillStyle = "rgba(170,181,168,0.78)";
    spectrumCtx.fillText(String(i + 1).padStart(2, "0"), centerX, height - labelHeight / 2);
  }

  spectrumCtx.textAlign = "left";
  spectrumCtx.fillStyle = "rgba(170,181,168,0.9)";
  spectrumCtx.fillText("0", plotLeft, plotTop + plotHeight + 1 * ratio);
  spectrumCtx.textAlign = "right";
  spectrumCtx.fillText("1", plotLeft + plotWidth, plotTop - 2 * ratio);
}

function resizeCanvas(target: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  const rect = target.getBoundingClientRect();
  const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
  const nextHeight = Math.max(1, Math.floor(rect.height * ratio));
  if (target.width !== nextWidth) target.width = nextWidth;
  if (target.height !== nextHeight) target.height = nextHeight;
}

function paintLed(x: number, y: number, radius: number, color?: number[]) {
  color ||= [0, 0, 0];
  const r = displayChannel(color[0]);
  const g = displayChannel(color[1]);
  const b = displayChannel(color[2]);
  if (display.diffuser) {
    const glowRadius = radius * 5.8;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.68)`);
    glow.addColorStop(0.32, `rgba(${r}, ${g}, ${b}, 0.34)`);
    glow.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, 0.11)`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.45, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.1);
  glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  glow.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.46)`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function displayChannel(value: number) {
  if (!value) return 0;
  const lifted = Math.pow(clamp(value) / 255, DISPLAY_GAMMA) * DISPLAY_EXPOSURE;
  const mapped = (1 - Math.exp(-lifted)) / (1 - Math.exp(-DISPLAY_EXPOSURE));
  return clamp(mapped * 255);
}

function paintDiffuserVeil(width: number, height: number, maxRadius: number) {
  const cx = width / 2;
  const cy = height / 2;
  const veil = ctx.createRadialGradient(cx, cy, maxRadius * 0.12, cx, cy, maxRadius * 1.18);
  veil.addColorStop(0, "rgba(246, 248, 240, 0.045)");
  veil.addColorStop(0.72, "rgba(246, 248, 240, 0.026)");
  veil.addColorStop(1, "rgba(246, 248, 240, 0.012)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(246,248,240,0.04)";
  ctx.lineWidth = Math.max(1, maxRadius * 0.004);
  for (let radius = maxRadius * 0.2; radius < maxRadius * 1.06; radius += Math.max(18, maxRadius * 0.11)) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBeatFlash(x: number, y: number, width: number, height: number, strength: number, ratio: number) {
  const bassWidth = width * 0.28;
  const alpha = 0.08 + strength * 0.24;
  const gradient = spectrumCtx.createLinearGradient(x, y, x + bassWidth, y);
  gradient.addColorStop(0, `rgba(255, 122, 112, ${alpha})`);
  gradient.addColorStop(0.55, `rgba(102, 210, 164, ${alpha * 0.7})`);
  gradient.addColorStop(1, "rgba(102, 210, 164, 0)");
  spectrumCtx.fillStyle = gradient;
  spectrumCtx.fillRect(x, y, bassWidth, height);
  spectrumCtx.strokeStyle = `rgba(255, 122, 112, ${0.35 + strength * 0.45})`;
  spectrumCtx.lineWidth = Math.max(1, ratio * 2);
  spectrumCtx.beginPath();
  spectrumCtx.moveTo(x, y + height);
  spectrumCtx.lineTo(x + bassWidth, y + height);
  spectrumCtx.stroke();
}
