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
  spectrumCtx.clearRect(0, 0, width, height);
  spectrumCtx.fillStyle = "#050605";
  spectrumCtx.fillRect(0, 0, width, height);
  const barWidth = width / audio.bins.length;
  for (let i = 0; i < audio.bins.length; i += 1) {
    const barHeight = Math.max(2, audio.bins[i] * height * 1.25);
    const color = palette(i / audio.bins.length, 1);
    spectrumCtx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    spectrumCtx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - 2), barHeight);
  }
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
