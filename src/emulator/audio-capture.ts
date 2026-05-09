import { applyAnalyzerTuning, audioPayload, updateAnalyzerAudio, WEB_AUDIO_ANALYSER_SMOOTHING } from "./audio-core.js";

type DisplayAudioConstraints = MediaTrackConstraints & {
  suppressLocalAudioPlayback?: boolean;
};

const AUDIO_CONTROL_CHANNEL = "edc-wled-audio-control";
const TUNING_STORAGE_KEY = "edc-wled-audio-tuning";

const captureAudio = {
  context: null,
  analyser: null,
  source: null,
  outputConnected: false,
  stream: null,
  inputKind: "none",
  timeData: new Uint8Array(2048),
  freqData: new Uint8Array(1024),
  fftAvg: new Float32Array(16),
  bins: new Float32Array(16),
  volume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: false,
  beatEnergy: 0,
  lastBeatAt: 0,
  bpm: 0,
  majorPeak: 0,
  magnitude: 0,
  lastBass: 0,
  lastVolume: 0,
  tuning: {
    inputGain: 1,
    fftGain: 1,
    noiseGate: 0.02,
    smoothing: 0.72,
  },
};

const ui = {
  status: element<HTMLElement>("captureStatus"),
  computer: element<HTMLButtonElement>("captureComputerButton"),
  mic: element<HTMLButtonElement>("captureMicButton"),
  stop: element<HTMLButtonElement>("captureStopButton"),
  source: element<HTMLElement>("captureSource"),
  volume: element<HTMLElement>("captureVolume"),
  bass: element<HTMLElement>("captureBass"),
  peak: element<HTMLElement>("capturePeak"),
  beat: element<HTMLElement>("captureBeat"),
};

let frameWs: WebSocket | null = null;
let lastAudioPost = 0;

loadAudioTuning();
applyAnalyzerTuning(captureAudio);
bindControls();
bindControlChannel();
connectFrameStream();
requestAnimationFrame(frame);

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing audio capture element #${id}`);
  return found as T;
}

function bindControls() {
  ui.computer.addEventListener("click", startComputerAudio);
  ui.mic.addEventListener("click", startMic);
  ui.stop.addEventListener("click", stopAudio);
}

function bindControlChannel() {
  try {
    const channel = new BroadcastChannel(AUDIO_CONTROL_CHANNEL);
    channel.addEventListener("message", (event) => {
      if (event.data?.type === "stop") stopAudio();
      if (event.data?.type === "tuning") {
        Object.assign(captureAudio.tuning, event.data.tuning || {});
        applyAnalyzerTuning(captureAudio);
      }
    });
  } catch {
    // BroadcastChannel is optional. The capture page can still stream with saved tuning.
  }
}

async function startComputerAudio() {
  try {
    await ensureAudioContext();
    disconnectAudio();
    const audioConstraints: DisplayAudioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
    };
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: audioConstraints,
    });
    for (const track of stream.getVideoTracks()) track.stop();
    if (!stream.getAudioTracks().length) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("No shared audio track was provided. Choose a tab/window that offers audio sharing.");
    }
    captureAudio.stream = stream;
    captureAudio.inputKind = "direct";
    captureAudio.source = captureAudio.context.createMediaStreamSource(captureAudio.stream);
    captureAudio.source.connect(captureAudio.analyser);
    ui.status.textContent = "Computer audio streaming to the WLED emulator.";
  } catch (error) {
    ui.status.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function startMic() {
  try {
    await ensureAudioContext();
    disconnectAudio();
    captureAudio.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    captureAudio.inputKind = "mic";
    captureAudio.source = captureAudio.context.createMediaStreamSource(captureAudio.stream);
    captureAudio.source.connect(captureAudio.analyser);
    ui.status.textContent = "Microphone streaming to the WLED emulator.";
  } catch (error) {
    ui.status.textContent = error instanceof Error ? error.message : String(error);
  }
}

function stopAudio() {
  disconnectAudio();
  captureAudio.volume = captureAudio.bass = captureAudio.mid = captureAudio.treble = captureAudio.bpm = 0;
  captureAudio.beat = false;
  captureAudio.bins.fill(0);
  captureAudio.fftAvg.fill(0);
  captureAudio.inputKind = "none";
  captureAudio.majorPeak = 0;
  captureAudio.magnitude = 0;
  sendAudioPayload();
  ui.status.textContent = "Audio capture stopped.";
}

async function ensureAudioContext() {
  if (!captureAudio.context) {
    captureAudio.context = new AudioContext();
    captureAudio.analyser = captureAudio.context.createAnalyser();
    captureAudio.analyser.fftSize = 2048;
    captureAudio.analyser.smoothingTimeConstant = WEB_AUDIO_ANALYSER_SMOOTHING;
  }
  applyAnalyzerTuning(captureAudio);
  if (captureAudio.context.state === "suspended") await captureAudio.context.resume();
}

function frame(now: number) {
  updateAnalyzerAudio(captureAudio);
  updateReadouts();
  if (captureAudio.analyser && captureAudio.source && now !== lastAudioPost) {
    lastAudioPost = now;
    sendAudioPayload();
  }
  requestAnimationFrame(frame);
}

function sendAudioPayload() {
  const payload = audioPayload(captureAudio);
  payload.source = "capture-window";
  if (frameWs?.readyState === WebSocket.OPEN) {
    try {
      frameWs.send(JSON.stringify(payload));
      return;
    } catch {
      // Fall through to HTTP fallback.
    }
  }
  fetch("/api/emulator/audio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function connectFrameStream() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  frameWs = new WebSocket(`${protocol}//${location.host}/api/emulator/frames`);
  frameWs.onclose = () => {
    frameWs = null;
    setTimeout(connectFrameStream, 1000);
  };
}

function updateReadouts() {
  ui.source.textContent = captureAudio.inputKind;
  ui.volume.textContent = captureAudio.volume.toFixed(2);
  ui.bass.textContent = captureAudio.bass.toFixed(2);
  ui.peak.textContent = `${Math.round(captureAudio.majorPeak)} Hz`;
  ui.beat.textContent = captureAudio.beat ? "yes" : "no";
}

function loadAudioTuning() {
  try {
    const saved = JSON.parse(localStorage.getItem(TUNING_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    for (const key of ["inputGain", "fftGain", "noiseGate", "smoothing"]) {
      if (Number.isFinite(saved[key])) captureAudio.tuning[key] = saved[key];
    }
  } catch {
    // Keep defaults when stored tuning is malformed.
  }
}

function disconnectAudio() {
  if (captureAudio.source) {
    try { captureAudio.source.disconnect(); } catch {}
    captureAudio.source = null;
  }
  if (captureAudio.outputConnected && captureAudio.analyser) {
    try { captureAudio.analyser.disconnect(); } catch {}
    captureAudio.outputConnected = false;
  }
  if (captureAudio.stream) {
    for (const track of captureAudio.stream.getTracks()) track.stop();
    captureAudio.stream = null;
  }
}
