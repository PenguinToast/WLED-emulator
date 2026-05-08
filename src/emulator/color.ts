import { activeSegment, model } from "./model.js";

export function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

export function mix(a, b, t) {
  return a + (b - a) * t;
}

export function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

export function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function paletteFor(id) {
  const colors = model.paletteData[id] || model.paletteData[0] || [[255, 160, 80], [20, 120, 255], [255, 40, 120]];
  return (position, brightness = 1) => {
    const p = wrap01(position) * colors.length;
    const index = Math.floor(p) % colors.length;
    const next = (index + 1) % colors.length;
    const t = p - Math.floor(p);
    return [
      mix(colors[index][0], colors[next][0], t) * brightness,
      mix(colors[index][1], colors[next][1], t) * brightness,
      mix(colors[index][2], colors[next][2], t) * brightness,
    ];
  };
}

export const helpers = {
  hsv,
  fade(leds, amount) {
    for (const led of leds) {
      led[0] *= amount;
      led[1] *= amount;
      led[2] *= amount;
    }
  },
  fill(leds, color) {
    for (const led of leds) {
      led[0] = color[0];
      led[1] = color[1];
      led[2] = color[2];
    }
  },
  setPixel(leds, index, color) {
    if (index < 0 || index >= leds.length) return;
    leds[index][0] = color[0];
    leds[index][1] = color[1];
    leds[index][2] = color[2];
  },
  addPixel(leds, index, color) {
    if (index < 0 || index >= leds.length) return;
    leds[index][0] += color[0];
    leds[index][1] += color[1];
    leds[index][2] += color[2];
  },
  color(index) {
    return activeSegment().col[index] || [0, 0, 0];
  },
};

