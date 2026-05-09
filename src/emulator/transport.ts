import { ui } from "./dom.js";
import { updateFromEmulatorAudio, updateFromEmulatorFrame, updateFromEmulatorState, updateFromWsMessage, model } from "./model.js";
import { updateReadouts } from "./readouts.js";

export async function loadInitialState() {
  const res = await fetch("/api/emulator/state");
  updateFromEmulatorState(await res.json());
  updateReadouts();
}

export function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  model.ws = new WebSocket(`${protocol}//${location.host}/ws`);
  connectFrameStream(protocol);
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

function connectFrameStream(protocol) {
  model.frameWs = new WebSocket(`${protocol}//${location.host}/api/emulator/frames`);
  model.frameWs.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message?.type === "frame") updateFromEmulatorFrame(message);
    if (message?.type === "audio") {
      updateFromEmulatorAudio(message);
      updateReadouts();
    }
  };
  model.frameWs.onclose = () => {
    setTimeout(() => connectFrameStream(protocol), 1000);
  };
}

let lastStatePoll = 0;
let lastFramePoll = 0;
let framePollPending = false;

export function pollEmulatorState(now) {
  pollNativeFrame(now);
  if (now - lastStatePoll >= 500) {
    lastStatePoll = now;
    fetch("/api/emulator/state")
      .then((res) => res.json())
      .then((json) => {
        updateFromEmulatorState(json);
        updateReadouts();
      })
      .catch(() => {});
  }
}

function pollNativeFrame(now) {
  if (model.frameWs?.readyState === WebSocket.OPEN) return;
  if (framePollPending || now - lastFramePoll < 16) return;
  lastFramePoll = now;
  framePollPending = true;
  fetch("/api/emulator/frame")
    .then((res) => res.json())
    .then(updateFromEmulatorFrame)
    .catch(() => {})
    .finally(() => {
      framePollPending = false;
    });
}
