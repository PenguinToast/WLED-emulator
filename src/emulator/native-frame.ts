import { ui } from "./dom.js";
import { ensureLedCount, model } from "./model.js";

const FRAME_TIMEOUT_MS = 1200;

export function applyNativeFrame() {
  ensureLedCount();
  const frame = model.externalFrame;
  const hasRgbFrame = typeof frame?.rgb === "string" && frame.rgb.length >= 6;
  const hasLedFrame = Array.isArray(frame?.leds) && frame.leds.length > 0;
  const fresh = (hasRgbFrame || hasLedFrame) && Date.now() - frame.updatedAt < FRAME_TIMEOUT_MS;

  if (!fresh) {
    clearLeds();
    if (model.ws?.readyState === WebSocket.OPEN) {
      ui.status.textContent = "Connected. Waiting for native C++ frames.";
    }
    return;
  }

  if (hasRgbFrame) applyRgbFrame(frame.rgb);
  else applyLedArrayFrame(frame.leds);
  ui.status.textContent = `Native renderer active: ${frame.source || "cpp_harness"}.`;
}

function applyRgbFrame(rgb) {
  for (let index = 0; index < model.leds.length; index += 1) {
    const offset = index * 6;
    model.leds[index][0] = Number.parseInt(rgb.slice(offset, offset + 2), 16) || 0;
    model.leds[index][1] = Number.parseInt(rgb.slice(offset + 2, offset + 4), 16) || 0;
    model.leds[index][2] = Number.parseInt(rgb.slice(offset + 4, offset + 6), 16) || 0;
  }
}

function applyLedArrayFrame(leds) {
  for (let index = 0; index < model.leds.length; index += 1) {
    const color = leds[index] || [0, 0, 0];
    model.leds[index][0] = color[0] || 0;
    model.leds[index][1] = color[1] || 0;
    model.leds[index][2] = color[2] || 0;
  }
}

function clearLeds() {
  for (const led of model.leds) {
    led[0] = 0;
    led[1] = 0;
    led[2] = 0;
  }
}
