import { clamp, paletteFor } from "./color.js";
import { canvas, ctx, spectrumCanvas, spectrumCtx } from "./dom.js";
import { activeSegment, audio, model } from "./model.js";

const DISPLAY_GAIN = 2.4;

export function draw() {
  resizeCanvas(canvas);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050605";
  ctx.fillRect(0, 0, width, height);

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
}

export function drawSpectrum() {
  resizeCanvas(spectrumCanvas);
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

function paintLed(x, y, radius, color) {
  color ||= [0, 0, 0];
  const r = clamp(color[0] * DISPLAY_GAIN);
  const g = clamp(color[1] * DISPLAY_GAIN);
  const b = clamp(color[2] * DISPLAY_GAIN);
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
