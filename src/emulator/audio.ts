import { ui } from "./dom.js";
import { audio, model } from "./model.js";
import { applyAnalyzerTuning, audioPayload, updateAnalyzerAudio, WEB_AUDIO_ANALYSER_SMOOTHING } from "./audio-core.js";

const AUDIO_CONTROL_CHANNEL = "edc-wled-audio-control";
const TUNING_STORAGE_KEY = "edc-wled-audio-tuning";

export function bindAudioTuningControls() {
  loadAudioTuning();
  syncAudioTuningControls();
  const bindSlider = (input, key, valueOutput, formatter) => {
    input.addEventListener("input", () => {
      audio.tuning[key] = Number(input.value);
      valueOutput.textContent = formatter(audio.tuning[key]);
      applyAudioTuning();
      saveAudioTuning();
    });
  };
  bindSlider(ui.inputGain, "inputGain", ui.inputGainValue, formatGain);
  bindSlider(ui.fftGain, "fftGain", ui.fftGainValue, formatGain);
  bindSlider(ui.noiseGate, "noiseGate", ui.noiseGateValue, formatLevel);
  bindSlider(ui.smoothing, "smoothing", ui.smoothingValue, formatLevel);
  applyAudioTuning();
}

export async function startMic() {
  try {
    await ensureAudioContext();
    disconnectAudio();
    ui.player.pause();
    audio.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    audio.inputKind = "mic";
    resetAudioAnalysis();
    audio.source = audio.context.createMediaStreamSource(audio.stream);
    audio.source.connect(audio.analyser);
    ui.status.textContent = "Microphone active. WLED UI changes will drive this output.";
  } catch (error) {
    ui.status.textContent = error.message;
  }
}

export async function startComputerAudio() {
  const capture = window.open("/emulator/audio-capture.html", "edc-wled-audio-capture", "popup,width=520,height=620");
  if (capture) {
    capture.focus();
    ui.status.textContent = "Audio capture opened. Start Computer audio there; it will keep streaming if this page reloads.";
  } else {
    ui.status.textContent = "Popup was blocked. Allow popups or open /emulator/audio-capture.html manually.";
  }
}

export async function loadFile(file) {
  if (!file) return;
  try {
    await ensureAudioContext();
    disconnectAudio();
    ui.player.src = URL.createObjectURL(file);
    audio.inputKind = "direct";
    resetAudioAnalysis();
    if (!audio.mediaElementSource) audio.mediaElementSource = audio.context.createMediaElementSource(ui.player);
    audio.source = audio.mediaElementSource;
    audio.source.connect(audio.analyser);
    audio.analyser.connect(audio.context.destination);
    audio.outputConnected = true;
    await ui.player.play();
    ui.status.textContent = `Playing ${file.name}`;
  } catch (error) {
    ui.status.textContent = error.message;
  }
}

export function stopAudio() {
  broadcastAudioControl({ type: "stop" });
  disconnectAudio();
  ui.player.pause();
  ui.player.removeAttribute("src");
  ui.player.load();
  audio.volume = audio.bass = audio.mid = audio.treble = audio.bpm = 0;
  audio.beat = false;
  resetAudioAnalysis();
  audio.inputKind = "none";
  audio.majorPeak = 0;
  audio.magnitude = 0;
  sendAudioPayload();
}

export function updateAudio() {
  updateAnalyzerAudio(audio);
}

let lastAudioPost = 0;
let lastAudioStreamError = "";
export function postAudio(now) {
  if (!audio.analyser || !audio.source) return;
  if (now === lastAudioPost) return;
  lastAudioPost = now;
  sendAudioPayload();
}

function sendAudioPayload() {
  const payload = audioPayload(audio);
  if (model.frameWs?.readyState === WebSocket.OPEN && model.frameWs.bufferedAmount < 64 * 1024) {
    try {
      model.frameWs.send(JSON.stringify(payload));
      clearAudioStreamError();
      return;
    } catch {
      model.frameWs.close();
      setAudioStreamError("Audio WebSocket send failed. Reconnecting...");
      return;
    }
  }
  if (model.frameWs?.readyState === WebSocket.OPEN) {
    setAudioStreamError("Audio WebSocket is backed up. Waiting for it to drain...");
  } else {
    setAudioStreamError("Audio WebSocket disconnected. Reconnecting...");
  }
}

function setAudioStreamError(message) {
  if (lastAudioStreamError === message) return;
  lastAudioStreamError = message;
  model.audioStreamError = message;
  ui.status.textContent = message;
}

function clearAudioStreamError() {
  if (!lastAudioStreamError) return;
  lastAudioStreamError = "";
  model.audioStreamError = "";
}

async function ensureAudioContext() {
  if (!audio.context) {
    audio.context = new AudioContext();
    audio.analyser = audio.context.createAnalyser();
    audio.analyser.fftSize = 2048;
    audio.analyser.smoothingTimeConstant = WEB_AUDIO_ANALYSER_SMOOTHING;
  }
  applyAudioTuning();
  if (audio.context.state === "suspended") await audio.context.resume();
}

function applyAudioTuning() {
  applyAnalyzerTuning(audio);
}

function loadAudioTuning() {
  try {
    const saved = JSON.parse(localStorage.getItem(TUNING_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    for (const key of ["inputGain", "fftGain", "noiseGate", "smoothing"]) {
      if (Number.isFinite(saved[key])) audio.tuning[key] = saved[key];
    }
    applyAudioTuning();
  } catch {
    // Keep defaults when stored tuning is malformed.
  }
}

function saveAudioTuning() {
  localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(audio.tuning));
  broadcastAudioControl({ type: "tuning", tuning: audio.tuning });
}

function syncAudioTuningControls() {
  ui.inputGain.value = String(audio.tuning.inputGain);
  ui.fftGain.value = String(audio.tuning.fftGain);
  ui.noiseGate.value = String(audio.tuning.noiseGate);
  ui.smoothing.value = String(audio.tuning.smoothing);
  ui.inputGainValue.textContent = formatGain(audio.tuning.inputGain);
  ui.fftGainValue.textContent = formatGain(audio.tuning.fftGain);
  ui.noiseGateValue.textContent = formatLevel(audio.tuning.noiseGate);
  ui.smoothingValue.textContent = formatLevel(audio.tuning.smoothing);
}

function formatGain(value) {
  return `${value.toFixed(2)}x`;
}

function formatLevel(value) {
  return value.toFixed(3).replace(/0$/, "").replace(/0$/, "");
}

function disconnectAudio() {
  if (audio.source) {
    try { audio.source.disconnect(); } catch {}
    audio.source = null;
  }
  if (audio.outputConnected && audio.analyser) {
    try { audio.analyser.disconnect(); } catch {}
    audio.outputConnected = false;
  }
  if (audio.stream) {
    for (const track of audio.stream.getTracks()) track.stop();
    audio.stream = null;
  }
}

function resetAudioAnalysis() {
  audio.bins.fill(0);
  audio.fftAvg.fill(0);
  audio.beatHistory.length = 0;
  audio.pcAgcSpan = 0;
  audio.pcAgcInitialized = false;
  audio.pcNoiseFloor.fill(0);
}

function broadcastAudioControl(message) {
  try {
    const channel = new BroadcastChannel(AUDIO_CONTROL_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel is optional; local audio still works without it.
  }
}
