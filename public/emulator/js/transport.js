import { ui } from "./dom.js";
import { updateFromEmulatorState, updateFromWsMessage, model } from "./model.js";
import { updateReadouts } from "./readouts.js";

export async function loadInitialState() {
  const res = await fetch("/api/emulator/state");
  updateFromEmulatorState(await res.json());
  updateReadouts();
}

export function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  model.ws = new WebSocket(`${protocol}//${location.host}/ws`);
  model.ws.onopen = () => {
    ui.status.textContent = "Connected. Open the WLED UI and change colors/effects.";
  };
  model.ws.onmessage = (event) => {
    updateFromWsMessage(JSON.parse(event.data));
    updateReadouts();
  };
  model.ws.onclose = () => {
    ui.status.textContent = "Disconnected. Reconnecting...";
    setTimeout(connect, 1000);
  };
}

let lastStatePoll = 0;
export function pollEmulatorState(now) {
  if (now - lastStatePoll < 120) return;
  lastStatePoll = now;
  fetch("/api/emulator/state")
    .then((res) => res.json())
    .then(updateFromEmulatorState)
    .catch(() => {});
}

