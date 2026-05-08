import { ui } from "./dom.js";
import { audio, model } from "./model.js";
import { clamp, mix } from "./color.js";

type DisplayAudioConstraints = MediaTrackConstraints & {
  suppressLocalAudioPlayback?: boolean;
};

const WLED_SAMPLE_RATE = 22050;
const WLED_FFT_SAMPLES = 512;
const WLED_HZ_PER_BIN = WLED_SAMPLE_RATE / WLED_FFT_SAMPLES;
const WLED_ANALYZER_GAIN = 384;
const WLED_FFT_DOWNSCALE = 0.46;
const WLED_MANUAL_GAIN = 60 / 40 + 1 / 16;
const WLED_PINK = [
  1.7, 1.71, 1.73, 1.78,
  1.68, 1.56, 1.55, 1.63,
  1.79, 1.62, 1.8, 2.06,
  2.47, 3.35, 6.83, 9.55,
];
const WLED_BANDS = [
  [1, 2, 1],
  [2, 3, 1],
  [3, 5, 1],
  [5, 7, 1],
  [7, 10, 1],
  [10, 13, 1],
  [13, 19, 1],
  [19, 26, 1],
  [26, 33, 1],
  [33, 44, 1],
  [44, 56, 1],
  [56, 70, 1],
  [70, 86, 1],
  [86, 104, 1],
  [104, 165, 0.88],
  [165, 215, 0.7],
];

export async function startMic() {
  try {
    await ensureAudioContext();
    disconnectAudio();
    ui.player.pause();
    audio.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    audio.source = audio.context.createMediaStreamSource(audio.stream);
    audio.source.connect(audio.analyser);
    ui.status.textContent = "Microphone active. WLED UI changes will drive this output.";
  } catch (error) {
    ui.status.textContent = error.message;
  }
}

export async function startComputerAudio() {
  try {
    await ensureAudioContext();
    disconnectAudio();
    ui.player.pause();
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
    audio.stream = stream;
    audio.source = audio.context.createMediaStreamSource(audio.stream);
    audio.source.connect(audio.analyser);
    ui.status.textContent = "Computer audio active. Shared audio is driving WLED audio-reactive effects.";
  } catch (error) {
    ui.status.textContent = error.message;
  }
}

export async function loadFile(file) {
  if (!file) return;
  try {
    await ensureAudioContext();
    disconnectAudio();
    ui.player.src = URL.createObjectURL(file);
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
  disconnectAudio();
  ui.player.pause();
  ui.player.removeAttribute("src");
  ui.player.load();
  audio.volume = audio.bass = audio.mid = audio.treble = audio.bpm = 0;
  audio.beat = false;
  audio.bins.fill(0);
  audio.fftAvg.fill(0);
  audio.majorPeak = 0;
  audio.magnitude = 0;
  sendAudioPayload();
}

export function updateAudio() {
  if (!audio.analyser) return;
  audio.analyser.getByteTimeDomainData(audio.timeData);
  audio.analyser.getByteFrequencyData(audio.freqData);
  let rms = 0;
  for (const sample of audio.timeData) {
    const centered = (sample - 128) / 128;
    rms += centered * centered;
  }
  audio.volume = clamp(Math.sqrt(rms / audio.timeData.length) * 2.4, 0, 1);
  const nyquist = audio.context.sampleRate / 2;
  const hzPerBin = nyquist / audio.freqData.length;
  const rangeAverage = (fromHz, toHz) => {
    const from = Math.max(0, Math.floor(fromHz / hzPerBin));
    const to = Math.min(audio.freqData.length - 1, Math.ceil(toHz / hzPerBin));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += audio.freqData[i] / 255;
    return sum / Math.max(1, to - from + 1);
  };
  audio.bass = rangeAverage(20, 180);
  audio.mid = rangeAverage(180, 2200);
  audio.treble = rangeAverage(2200, 9000);
  updateWledFftBins(hzPerBin, nyquist);
  const now = performance.now();
  audio.beatEnergy = mix(audio.beatEnergy, audio.bass + audio.volume * 0.45, 0.08);
  audio.beat = audio.bass + audio.volume * 0.45 > audio.beatEnergy * 1.55 && now - audio.lastBeatAt > 230;
  if (audio.beat) {
    if (audio.lastBeatAt > 0) {
      const instantBpm = 60000 / (now - audio.lastBeatAt);
      if (instantBpm > 60 && instantBpm < 190) audio.bpm = audio.bpm ? mix(audio.bpm, instantBpm, 0.2) : instantBpm;
    }
    audio.lastBeatAt = now;
  }
}

let lastAudioPost = 0;
export function postAudio(now) {
  if (!audio.analyser || !audio.source) return;
  if (now === lastAudioPost) return;
  lastAudioPost = now;
  sendAudioPayload();
}

function sendAudioPayload() {
  const payload = {
    type: "audio",
    source: "browser",
    volume: audio.volume,
    bass: audio.bass,
    mid: audio.mid,
    treble: audio.treble,
    beat: audio.beat,
    bpm: audio.bpm,
    majorPeak: audio.majorPeak,
    magnitude: audio.magnitude,
    bins: Array.from(audio.bins.slice(0, 16)),
  };
  if (model.frameWs?.readyState === WebSocket.OPEN) {
    try {
      model.frameWs.send(JSON.stringify(payload));
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

function updateWledFftBins(hzPerBin, nyquist) {
  let peakMagnitude = 0;
  let peakFrequency = 0;
  const highestWledBin = Math.min(215, Math.floor(nyquist / WLED_HZ_PER_BIN));
  const peakEnd = Math.min(audio.freqData.length - 1, Math.ceil(((highestWledBin + 1) * WLED_HZ_PER_BIN) / hzPerBin));
  for (let index = 1; index <= peakEnd; index += 1) {
    const magnitude = audio.freqData[index] / 255;
    if (magnitude > peakMagnitude) {
      peakMagnitude = magnitude;
      peakFrequency = (index + 0.5) * hzPerBin;
    }
  }

  audio.majorPeak = peakMagnitude > 0.03 ? clamp(peakFrequency, 1, 11025) : 0;
  audio.magnitude = peakMagnitude;

  const noiseGateOpen = audio.volume > 0.01 || peakMagnitude > 0.03;
  for (let index = 0; index < WLED_BANDS.length; index += 1) {
    const [fromBin, toBin, damping] = WLED_BANDS[index];
    let fftCalc = noiseGateOpen
      ? averageWledBinRange(fromBin, toBin, hzPerBin) * WLED_ANALYZER_GAIN * damping
      : 0;

    if (noiseGateOpen) {
      fftCalc *= WLED_PINK[index] * WLED_FFT_DOWNSCALE * WLED_MANUAL_GAIN;
      fftCalc = clamp(fftCalc, 0, 1023);
    }

    if (fftCalc > audio.fftAvg[index]) {
      audio.fftAvg[index] = fftCalc * 0.75 + audio.fftAvg[index] * 0.25;
    } else {
      audio.fftAvg[index] = fftCalc * 0.17 + audio.fftAvg[index] * 0.83;
    }
    audio.fftAvg[index] = clamp(audio.fftAvg[index], 0, 1023);

    let currentResult = audio.fftAvg[index] * 0.38 - 6;
    currentResult = currentResult > 1 ? Math.sqrt(currentResult) : 0;
    currentResult *= 0.85 + index / 4.5;
    audio.bins[index] = clamp((currentResult / 16) * 255, 0, 255) / 255;
  }
}

function averageWledBinRange(fromBin, toBin, hzPerBin) {
  const fromHz = fromBin * WLED_HZ_PER_BIN;
  const toHz = (toBin + 1) * WLED_HZ_PER_BIN;
  const from = Math.max(1, Math.floor(fromHz / hzPerBin));
  const to = Math.min(audio.freqData.length - 1, Math.max(from, Math.ceil(toHz / hzPerBin)));
  let sum = 0;
  for (let index = from; index <= to; index += 1) sum += audio.freqData[index] / 255;
  return sum / Math.max(1, to - from + 1);
}

async function ensureAudioContext() {
  if (!audio.context) {
    audio.context = new AudioContext();
    audio.analyser = audio.context.createAnalyser();
    audio.analyser.fftSize = 2048;
    audio.analyser.smoothingTimeConstant = 0.72;
  }
  if (audio.context.state === "suspended") await audio.context.resume();
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
