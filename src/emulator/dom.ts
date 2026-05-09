function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing emulator element #${id}`);
  return found as T;
}

function context2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is not available");
  return context;
}

export const canvas = element<HTMLCanvasElement>("ledCanvas");
export const ctx = context2d(canvas);
export const spectrumCanvas = element<HTMLCanvasElement>("spectrumCanvas");
export const spectrumCtx = context2d(spectrumCanvas);

export const ui = {
  status: element<HTMLElement>("status"),
  mic: element<HTMLButtonElement>("micButton"),
  computerAudio: element<HTMLButtonElement>("computerAudioButton"),
  file: element<HTMLInputElement>("fileInput"),
  stop: element<HTMLButtonElement>("stopButton"),
  player: element<HTMLAudioElement>("audioPlayer"),
  power: element<HTMLElement>("powerReadout"),
  brightness: element<HTMLElement>("brightnessReadout"),
  effect: element<HTMLElement>("effectReadout"),
  palette: element<HTMLElement>("paletteReadout"),
  ledCount: element<HTMLElement>("ledCountReadout"),
  volume: element<HTMLElement>("volumeReadout"),
  bass: element<HTMLElement>("bassReadout"),
  mid: element<HTMLElement>("midReadout"),
  treble: element<HTMLElement>("trebleReadout"),
  bpm: element<HTMLElement>("bpmReadout"),
  beatIndicator: element<HTMLElement>("beatIndicator"),
  inputGain: element<HTMLInputElement>("inputGainSlider"),
  inputGainValue: element<HTMLOutputElement>("inputGainValue"),
  fftGain: element<HTMLInputElement>("fftGainSlider"),
  fftGainValue: element<HTMLOutputElement>("fftGainValue"),
  noiseGate: element<HTMLInputElement>("noiseGateSlider"),
  noiseGateValue: element<HTMLOutputElement>("noiseGateValue"),
  smoothing: element<HTMLInputElement>("smoothingSlider"),
  smoothingValue: element<HTMLOutputElement>("smoothingValue"),
};
