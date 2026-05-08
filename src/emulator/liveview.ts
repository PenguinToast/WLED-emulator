import { clamp } from "./color.js";

const canvas = document.getElementById("ledCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D context is not available");
let state = null;

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  ws.onmessage = (event) => {
    const json = JSON.parse(event.data);
    if (json.state) state = json.state;
  };
  ws.onclose = () => setTimeout(connect, 1000);
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
}

function draw(now) {
  resize();
  const width = canvas.width;
  const height = canvas.height;
  const segments = state?.seg?.length ? state.seg : [{ start: 0, stop: 133, len: 133, col: [[255, 160, 80]], on: true, fx: 0, bri: 255 }];
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.45;
  const ringGap = maxRadius / Math.max(1, segments.length);
  const ledRadius = Math.max(2, Math.min(12, ringGap * 0.18));

  ctx.fillStyle = "#050605";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = Math.max(2, ringGap * 0.18);
  for (let ring = 0; ring < segments.length; ring += 1) {
    const radius = ring === 0 ? ringGap * 0.34 : ringGap * (ring + 0.54);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let ring = 0; ring < segments.length; ring += 1) {
    const seg = segments[ring];
    const count = Math.max(1, (seg.stop || 0) - (seg.start || 0) || seg.len || 1);
    const bri = ((state?.on && seg.on) ? (state?.bri || 180) * (seg.bri || 255) / 255 : 0) / 255;
    const radius = ring === 0 ? 0 : ringGap * (ring + 0.54);
    for (let i = 0; i < count; i += 1) {
      const wave = 0.45 + 0.55 * Math.sin(now / 450 + i * 0.2 + (seg.fx || 0)) ** 2;
      const color = seg.col?.[0] || [255, 160, 80];
      const r = Math.round(clamp(color[0] * bri * wave));
      const g = Math.round(clamp(color[1] * bri * wave));
      const b = Math.round(clamp(color[2] * bri * wave));
      const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(x, y, ledRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  requestAnimationFrame(draw);
}

connect();
fetch("/json/si").then((res) => res.json()).then((json) => { state = json.state; });
requestAnimationFrame(draw);
