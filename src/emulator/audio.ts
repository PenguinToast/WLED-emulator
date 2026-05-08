import { ui } from "./dom.js";
import { audio, model } from "./model.js";
import { clamp, mix } from "./color.js";

type DisplayAudioConstraints = MediaTrackConstraints & {
  suppressLocalAudioPlayback?: boolean;
};

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
  const minFrequency = 60;
  const maxFrequency = Math.min(11025, nyquist);
  let peakMagnitude = 0;
  let peakFrequency = 0;
  const compensatedMagnitude = (index) => {
    const frequency = Math.max(minFrequency, (index + 0.5) * hzPerBin);
    const tilt = clamp((frequency / 1000) ** 0.28, 0.55, 2.2);
    return clamp((audio.freqData[index] / 255) * tilt, 0, 1);
  };
  for (let i = 0; i < audio.bins.length; i += 1) {
    const fromHz = minFrequency * (maxFrequency / minFrequency) ** (i / audio.bins.length);
    const toHz = minFrequency * (maxFrequency / minFrequency) ** ((i + 1) / audio.bins.length);
    const start = Math.max(1, Math.floor(fromHz / hzPerBin));
    const end = Math.min(audio.freqData.length - 1, Math.max(start + 1, Math.ceil(toHz / hzPerBin)));
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      const magnitude = compensatedMagnitude(j);
      sum += magnitude;
      if (magnitude > peakMagnitude) {
        peakMagnitude = magnitude;
        peakFrequency = (j + 0.5) * hzPerBin;
      }
    }
    audio.bins[i] = sum / (end - start);
  }
  audio.majorPeak = peakMagnitude > 0.03 ? peakFrequency : 0;
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
