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
  if (model.ws?.readyState === WebSocket.OPEN || model.ws?.readyState === WebSocket.CONNECTING) return;
  model.ws = new WebSocket(`${protocol}//${location.host}/ws`);
  connectFrameStream(protocol);
  model.ws.onopen = () => {
    ui.status.textContent = "Connected. Open the WLED UI and change colors/effects.";
  };
  model.ws.onmessage = (event) => {
    updateFromWsMessage(JSON.parse(event.data));
    updateReadouts();
  };
  model.ws.onerror = () => {
    model.ws?.close();
  };
  model.ws.onclose = () => {
    model.ws = null;
    ui.status.textContent = "Disconnected. Reconnecting...";
    setTimeout(connect, 1000);
  };
}

let frameReconnectTimer = 0;
let frameReconnectDelay = 500;

function connectFrameStream(protocol) {
  if (model.frameWs?.readyState === WebSocket.OPEN || model.frameWs?.readyState === WebSocket.CONNECTING) return;
  model.frameWs = new WebSocket(`${protocol}//${location.host}/api/emulator/frames`);
  model.frameWs.onopen = () => {
    frameReconnectDelay = 500;
  };
  model.frameWs.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message?.type === "frame") updateFromEmulatorFrame(message);
    if (message?.type === "audio") {
      updateFromEmulatorAudio(message);
      updateReadouts();
    }
  };
  model.frameWs.onerror = () => {
    model.frameWs?.close();
  };
  model.frameWs.onclose = () => {
    model.frameWs = null;
    scheduleFrameReconnect(protocol);
  };
}

function scheduleFrameReconnect(protocol) {
  if (frameReconnectTimer) return;
  frameReconnectTimer = window.setTimeout(() => {
    frameReconnectTimer = 0;
    connectFrameStream(protocol);
    frameReconnectDelay = Math.min(5000, Math.round(frameReconnectDelay * 1.6));
  }, frameReconnectDelay);
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
