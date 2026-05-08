import { ui } from "./dom.js";
import { ensureLedCount, model } from "./model.js";

const FRAME_TIMEOUT_MS = 1200;

export function applyNativeFrame() {
  ensureLedCount();
  const frame = model.externalFrame;
  const fresh = frame?.leds?.length && Date.now() - frame.updatedAt < FRAME_TIMEOUT_MS;

  if (!fresh) {
    clearLeds();
    if (model.ws?.readyState === WebSocket.OPEN) {
      ui.status.textContent = "Connected. Waiting for native C++ frames.";
    }
    return;
  }

  for (let index = 0; index < model.leds.length; index += 1) {
    const color = frame.leds[index] || [0, 0, 0];
    model.leds[index][0] = color[0] || 0;
    model.leds[index][1] = color[1] || 0;
    model.leds[index][2] = color[2] || 0;
  }
  ui.status.textContent = `Native renderer active: ${frame.source || "cpp_harness"}.`;
}

function clearLeds() {
  for (const led of model.leds) {
    led[0] = 0;
    led[1] = 0;
    led[2] = 0;
  }
}
