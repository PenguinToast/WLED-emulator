import { clamp, helpers, hsv, paletteFor } from "./color.js";
import { ui } from "./dom.js";
import { activeSegment, audio, ensureLedCount, model } from "./model.js";

export const defaultCustomEffect = `function render({ leds, time, audio, segment, palette, helpers }) {
  helpers.fade(leds, 0.82);
  const center = Math.floor(leds.length * ((Math.sin(time * 0.9) + 1) / 2));
  const width = 4 + audio.bass * 24 + segment.ix * 0.08;
  const hue = (time * 36 + audio.treble * 150) % 360;

  for (let offset = -width; offset <= width; offset += 1) {
    const distance = Math.abs(offset) / width;
    const color = helpers.hsv(hue + offset * 2, 0.85, (1 - distance) * (0.35 + audio.volume));
    helpers.addPixel(leds, center + Math.round(offset), color);
  }

  if (audio.beat) {
    for (let i = 0; i < leds.length; i += 9) {
      helpers.addPixel(leds, i, palette(i / leds.length + time * 0.1, 1));
    }
  }
}`;

export function renderEffect(time) {
  ensureLedCount();
  if (model.externalFrame?.leds?.length && Date.now() - model.externalFrame.updatedAt < 1200) {
    for (let i = 0; i < model.leds.length; i += 1) {
      const color = model.externalFrame.leds[i] || [0, 0, 0];
      model.leds[i][0] = color[0] || 0;
      model.leds[i][1] = color[1] || 0;
      model.leds[i][2] = color[2] || 0;
    }
    return;
  }
  const segments = model.state?.seg?.length ? model.state.seg : [activeSegment()];
  for (const segment of segments) renderSegmentEffect(segment, time);
}

export function compileCustom() {
  try {
    const source = ui.editor.value;
    model.custom = new Function("api", `"use strict";\n${source}\nif (typeof render !== "function") throw new Error("Define function render(api)");\nreturn render(api);`);
    localStorage.setItem("edc-wled-protocol-custom", source);
    ui.error.textContent = "";
  } catch (error) {
    model.custom = null;
    ui.error.textContent = error.message;
  }
}

export function bindCustomEditor() {
  ui.editor.value = localStorage.getItem("edc-wled-protocol-custom") || defaultCustomEffect;
  ui.run.addEventListener("click", compileCustom);
  ui.reset.addEventListener("click", () => {
    ui.editor.value = defaultCustomEffect;
    compileCustom();
  });
  ui.editor.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      ui.editor.setRangeText("  ", ui.editor.selectionStart, ui.editor.selectionEnd, "end");
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") compileCustom();
  });
}

function renderSegmentEffect(segment, time) {
  const start = segment.start || 0;
  const stop = Math.min(model.leds.length, segment.stop || start + (segment.len || 1));
  const leds = model.leds.slice(start, stop);
  const palette = paletteFor(segment.pal);
  const isOn = model.state?.on && segment.on;
  const fx = segment.fx || 0;
  const effectName = model.effects[fx] || "Solid";
  const effectData = model.fxdata?.[fx] || "";
  const speed = 0.2 + segment.sx / 80;
  const intensity = segment.ix / 255;

  if (!isOn) helpers.fade(leds, 0.72);
  else if (effectName === "Solid") helpers.fill(leds, segment.col[0]);
  else if (effectName.includes("Blink") || effectName.includes("Strobe")) helpers.fill(leds, Math.sin(time * speed * 4) > 0 ? segment.col[0] : segment.col[1]);
  else if (effectName.includes("Breathe") || effectName.includes("Fade")) helpers.fill(leds, segment.col[0].map((channel) => channel * (0.18 + 0.82 * (Math.sin(time * speed * 2) + 1) / 2)));
  else if (effectName.includes("Rainbow") || effectName.includes("Colorloop")) {
    for (let i = 0; i < leds.length; i += 1) helpers.setPixel(leds, i, hsv(i * 360 / leds.length + time * speed * 80, 0.9, 1));
  } else if (effectName.includes("Colorwaves") || effectName.includes("Flow") || effectName.includes("Noise")) {
    for (let i = 0; i < leds.length; i += 1) {
      const wave = (Math.sin(i * 0.13 + time * speed * 2) + Math.sin(i * 0.047 - time * speed * 3)) * 0.25 + 0.5;
      helpers.setPixel(leds, i, palette(wave + time * 0.04, 1));
    }
  } else if (effectData.includes("f")) {
    helpers.fade(leds, 0.62);
    const idle = audio.volume < 0.02;
    for (let b = 0; b < audio.bins.length; b += 1) {
      const binStart = Math.floor((b / audio.bins.length) * leds.length);
      const binEnd = Math.floor(((b + 1) / audio.bins.length) * leds.length);
      const idleLevel = idle ? 0.14 + 0.08 * Math.sin(time * 2 + b * 0.45) : 0;
      const level = clamp(Math.max(idleLevel, audio.bins[b] * (1.3 + intensity)), 0, 1);
      for (let i = binStart; i < binEnd; i += 1) helpers.setPixel(leds, i, palette(b / audio.bins.length + time * 0.04, level));
    }
  } else if (effectData.includes("v") || effectName.includes("Ripple") || effectName.includes("Juggles")) {
    helpers.fade(leds, 0.72);
    const pulse = Math.max(0.16, audio.bass * (0.8 + intensity));
    for (let i = 0; i < leds.length; i += 1) {
      const distance = Math.abs(i / leds.length - 0.5);
      const wave = (Math.sin(distance * 44 - time * speed * 7) + 1) / 2;
      helpers.addPixel(leds, i, palette(distance + time * 0.05, wave * pulse));
    }
  } else if (effectName.includes("Sparkle") || effectName.includes("Twinkle") || effectName.includes("Glitter")) {
    helpers.fade(leds, 0.82);
    if (audio.beat || Math.random() < Math.max(0.015, audio.treble * 0.08)) {
      for (let i = 0; i < 2 + audio.volume * 16; i += 1) {
        helpers.addPixel(leds, Math.floor(Math.random() * leds.length), palette(Math.random(), 1));
      }
    }
  } else if (effectName.includes("Custom") && model.custom) {
    model.custom({ leds, time, frame: model.frame, audio, segment, state: model.state, palette, helpers });
  } else {
    for (let i = 0; i < leds.length; i += 1) {
      const wave = (Math.sin(i * 0.2 + time * speed * 2) + 1) / 2;
      helpers.setPixel(leds, i, palette(i / leds.length + time * 0.03, 0.25 + wave * 0.75));
    }
  }
}

