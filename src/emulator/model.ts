export const model = {
  state: null,
  info: null,
  effects: [],
  fxdata: [],
  palettes: [],
  paletteData: {},
  fixture: null,
  externalFrame: null,
  leds: [],
  ws: null,
  frameWs: null,
  frame: 0,
};

export const audio = {
  context: null,
  analyser: null,
  source: null,
  mediaElementSource: null,
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

export function activeSegment() {
  return model.state?.seg?.find((seg) => seg.sel) || model.state?.seg?.[0] || {
    len: 150,
    fx: 0,
    sx: 128,
    ix: 128,
    pal: 0,
    bri: 255,
    on: true,
    col: [[255, 160, 80], [0, 0, 0], [0, 0, 0]],
  };
}

export function ledCount() {
  return Math.max(1, model.info?.leds?.count || model.state?.seg?.reduce((max, seg) => Math.max(max, seg.stop || 0), 0) || 133);
}

export function ensureLedCount() {
  const count = ledCount();
  if (model.leds.length !== count) model.leds = Array.from({ length: count }, () => [0, 0, 0]);
}

export function updateFromEmulatorState(json) {
  model.state = json.state || model.state;
  model.info = json.info || model.info;
  model.effects = json.effects || model.effects;
  model.fxdata = json.fxdata || model.fxdata;
  model.palettes = json.palettes || model.palettes;
  model.paletteData = json.paletteData || model.paletteData;
  model.fixture = json.fixture || json.info?.fixture || model.fixture;
  model.externalFrame = json.externalFrame || model.externalFrame;
  if (json.audio) updateFromEmulatorAudio(json.audio);
}

export function updateFromEmulatorFrame(json) {
  model.externalFrame = json || model.externalFrame;
}

export function updateFromEmulatorAudio(json) {
  if (audio.analyser && audio.source) return;
  audio.inputKind = json.profile || json.source || "remote";
  audio.volume = Number(json.volume ?? 0);
  audio.bass = Number(json.bass ?? 0);
  audio.mid = Number(json.mid ?? 0);
  audio.treble = Number(json.treble ?? 0);
  audio.beat = Boolean(json.beat);
  audio.bpm = Number(json.bpm ?? 0);
  audio.majorPeak = Number(json.majorPeak ?? 0);
  audio.magnitude = Number(json.magnitude ?? 0);
  if (Array.isArray(json.bins)) {
    for (let index = 0; index < audio.bins.length; index += 1) {
      audio.bins[index] = Number(json.bins[index] ?? 0);
    }
  }
}

export function updateFromWsMessage(json) {
  if (json.state) model.state = json.state;
  if (json.info) {
    model.info = json.info;
    model.fixture = json.info.fixture || model.fixture;
  }
}
