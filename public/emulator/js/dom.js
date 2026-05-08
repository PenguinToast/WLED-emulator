const $ = (id) => document.getElementById(id);

export const canvas = $("ledCanvas");
export const ctx = canvas.getContext("2d");
export const spectrumCanvas = $("spectrumCanvas");
export const spectrumCtx = spectrumCanvas.getContext("2d");

export const ui = {
  status: $("status"),
  mic: $("micButton"),
  file: $("fileInput"),
  stop: $("stopButton"),
  player: $("audioPlayer"),
  power: $("powerReadout"),
  brightness: $("brightnessReadout"),
  effect: $("effectReadout"),
  palette: $("paletteReadout"),
  ledCount: $("ledCountReadout"),
  volume: $("volumeReadout"),
  bass: $("bassReadout"),
  mid: $("midReadout"),
  treble: $("trebleReadout"),
  bpm: $("bpmReadout"),
  editor: $("editor"),
  run: $("runButton"),
  reset: $("resetButton"),
  error: $("error"),
};

