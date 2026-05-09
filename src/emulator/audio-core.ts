import { clamp, mix } from "./color.js";

type AudioState = {
  context: AudioContext | null;
  analyser: AnalyserNode | null;
  source: AudioNode | null;
  inputKind: string;
  timeData: Uint8Array<ArrayBuffer>;
  freqData: Uint8Array<ArrayBuffer>;
  fftAvg: Float32Array;
  bins: Float32Array;
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  beat: boolean;
  beatEnergy: number;
  lastBeatAt: number;
  bpm: number;
  majorPeak: number;
  magnitude: number;
  lastBass: number;
  lastVolume: number;
  tuning: {
    inputGain: number;
    fftGain: number;
    noiseGate: number;
    smoothing: number;
  };
};

const WLED_SAMPLE_RATE = 22050;
const WLED_FFT_SAMPLES = 512;
const WLED_HZ_PER_BIN = WLED_SAMPLE_RATE / WLED_FFT_SAMPLES;
const WLED_MIC_ANALYZER_GAIN = 150;
const DIRECT_ANALYZER_GAIN = 110;
export const WEB_AUDIO_ANALYSER_SMOOTHING = 0;
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
const DIRECT_EQ = [
  4.6, 3.8, 3.0, 2.35,
  1.8, 1.45, 1.28, 1.15,
  1.05, 0.98, 0.92, 0.86,
  0.8, 0.74, 0.68, 0.62,
];

export function updateAnalyzerAudio(audio: AudioState) {
  if (!audio.analyser || !audio.context) return;
  audio.analyser.getByteTimeDomainData(audio.timeData);
  audio.analyser.getByteFrequencyData(audio.freqData);
  const inputGain = audio.tuning.inputGain;
  let rms = 0;
  for (const sample of audio.timeData) {
    const centered = ((sample - 128) / 128) * inputGain;
    rms += centered * centered;
  }
  const previousBass = audio.bass;
  const previousVolume = audio.volume;
  audio.volume = clamp(Math.sqrt(rms / audio.timeData.length) * 1.45, 0, 1);
  const nyquist = audio.context.sampleRate / 2;
  const hzPerBin = nyquist / audio.freqData.length;
  const rangeAverage = (fromHz, toHz) => {
    const from = Math.max(0, Math.floor(fromHz / hzPerBin));
    const to = Math.min(audio.freqData.length - 1, Math.ceil(toHz / hzPerBin));
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += audio.freqData[i] / 255;
    return sum / Math.max(1, to - from + 1);
  };
  audio.bass = clamp(rangeAverage(20, 180) * inputGain, 0, 1);
  audio.mid = clamp(rangeAverage(180, 2200) * inputGain, 0, 1);
  audio.treble = clamp(rangeAverage(2200, 9000) * inputGain, 0, 1);
  updateWledFftBins(audio, hzPerBin, nyquist);
  updatePeakDetection(audio, previousBass, previousVolume);
  audio.lastBass = audio.bass;
  audio.lastVolume = audio.volume;
}

export function applyAnalyzerTuning(audio: AudioState) {
  audio.tuning.inputGain = clamp(audio.tuning.inputGain, 0.1, 3);
  audio.tuning.fftGain = clamp(audio.tuning.fftGain, 0.1, 3);
  audio.tuning.noiseGate = clamp(audio.tuning.noiseGate, 0, 0.15);
  audio.tuning.smoothing = clamp(audio.tuning.smoothing, 0, 0.95);
  if (audio.analyser) audio.analyser.smoothingTimeConstant = WEB_AUDIO_ANALYSER_SMOOTHING;
}

export function audioPayload(audio: AudioState) {
  return {
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
    profile: audio.inputKind,
    bins: Array.from(audio.bins.slice(0, 16)),
  };
}

function updatePeakDetection(audio: AudioState, previousBass: number, previousVolume: number) {
  const now = performance.now();
  const lowFrequencyPeak = audio.majorPeak >= 35 && audio.majorPeak <= 190 && audio.magnitude > 0.16;
  const bassRise = audio.bass - previousBass;
  const volumeRise = audio.volume - previousVolume;
  const energy = audio.bass * 0.9 + audio.volume * 0.35;
  audio.beatEnergy = mix(audio.beatEnergy || energy, energy, 0.035);
  const dynamicThreshold = Math.max(0.12, audio.beatEnergy * 1.22);
  const transient = bassRise > 0.035 || volumeRise > 0.025;
  audio.beat = lowFrequencyPeak && transient && energy > dynamicThreshold && now - audio.lastBeatAt > 120;
  if (audio.beat) {
    if (audio.lastBeatAt > 0) {
      const instantBpm = 60000 / (now - audio.lastBeatAt);
      if (instantBpm > 60 && instantBpm < 190) audio.bpm = audio.bpm ? mix(audio.bpm, instantBpm, 0.2) : instantBpm;
    }
    audio.lastBeatAt = now;
  }
}

function updateWledFftBins(audio: AudioState, hzPerBin: number, nyquist: number) {
  let peakMagnitude = 0;
  let peakFrequency = 0;
  const inputGain = audio.tuning.inputGain;
  const fftGain = audio.tuning.fftGain;
  const highestWledBin = Math.min(215, Math.floor(nyquist / WLED_HZ_PER_BIN));
  const peakEnd = Math.min(audio.freqData.length - 1, Math.ceil(((highestWledBin + 1) * WLED_HZ_PER_BIN) / hzPerBin));
  for (let index = 1; index <= peakEnd; index += 1) {
    const magnitude = clamp((audio.freqData[index] / 255) * inputGain, 0, 1);
    if (magnitude > peakMagnitude) {
      peakMagnitude = magnitude;
      peakFrequency = (index + 0.5) * hzPerBin;
    }
  }

  audio.majorPeak = peakMagnitude > 0.03 ? clamp(peakFrequency, 1, 11025) : 0;
  audio.magnitude = peakMagnitude;

  const directInput = audio.inputKind === "direct";
  const analyzerGain = directInput ? DIRECT_ANALYZER_GAIN : WLED_MIC_ANALYZER_GAIN;
  const profileCurve = directInput ? DIRECT_EQ : WLED_PINK;
  const gate = audio.tuning.noiseGate;
  const noiseGateOpen = audio.volume > gate || peakMagnitude > gate * 1.5;
  for (let index = 0; index < WLED_BANDS.length; index += 1) {
    const [fromBin, toBin, damping] = WLED_BANDS[index];
    let fftCalc = noiseGateOpen
      ? averageWledBinRange(audio, fromBin, toBin, hzPerBin) * analyzerGain * inputGain * fftGain * damping
      : 0;

    if (noiseGateOpen) {
      fftCalc *= profileCurve[index] * WLED_FFT_DOWNSCALE * WLED_MANUAL_GAIN;
      fftCalc = clamp(fftCalc, 0, 1023);
    }

    if (fftCalc > audio.fftAvg[index]) {
      audio.fftAvg[index] = fftCalc * 0.75 + audio.fftAvg[index] * 0.25;
    } else {
      const release = 0.08 + (1 - audio.tuning.smoothing) * 0.22;
      audio.fftAvg[index] = fftCalc * release + audio.fftAvg[index] * (1 - release);
    }
    audio.fftAvg[index] = clamp(audio.fftAvg[index], 0, 1023);

    let currentResult = audio.fftAvg[index] * 0.38 - 6;
    currentResult = currentResult > 1 ? Math.sqrt(currentResult) : 0;
    currentResult *= 0.85 + index / 4.5;
    audio.bins[index] = clamp((currentResult / 16) * 255, 0, 255) / 255;
  }
}

function averageWledBinRange(audio: AudioState, fromBin: number, toBin: number, hzPerBin: number) {
  let sum = 0;
  for (let index = fromBin; index <= toBin; index += 1) {
    sum += sampleFrequency(audio, index * WLED_HZ_PER_BIN, hzPerBin);
  }
  return sum / Math.max(1, toBin - fromBin + 1);
}

function sampleFrequency(audio: AudioState, frequency: number, hzPerBin: number) {
  const position = frequency / hzPerBin;
  const lower = Math.max(0, Math.min(audio.freqData.length - 1, Math.floor(position)));
  const upper = Math.max(lower, Math.min(audio.freqData.length - 1, lower + 1));
  const blend = position - lower;
  return mix(audio.freqData[lower] / 255, audio.freqData[upper] / 255, blend);
}
