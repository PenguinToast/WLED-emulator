const $ = (id) => document.getElementById(id);

const canvas = $("ledCanvas");
const ctx = canvas.getContext("2d");
const spectrumCanvas = $("spectrumCanvas");
const spectrumCtx = spectrumCanvas.getContext("2d");

const ui = {
  runtimeStatus: $("runtimeStatus"),
  bass: $("bassReadout"),
  mid: $("midReadout"),
  treble: $("trebleReadout"),
  volume: $("volumeReadout"),
  startMic: $("startMicButton"),
  stopAudio: $("stopAudioButton"),
  audioFile: $("audioFileInput"),
  audioPlayer: $("audioPlayer"),
  ledCount: $("ledCountInput"),
  layout: $("layoutSelect"),
  matrixWidth: $("matrixWidthInput"),
  brightness: $("brightnessInput"),
  effect: $("effectSelect"),
  palette: $("paletteSelect"),
  speed: $("speedInput"),
  intensity: $("intensityInput"),
  customEditor: $("customEditor"),
  runCustom: $("runCustomButton"),
  resetCustom: $("resetCustomButton"),
  error: $("effectError"),
};

const defaultCustomEffect = `function render({ leds, time, audio, params, palette, helpers }) {
  helpers.fade(leds, 0.82);

  const center = Math.floor(leds.length * ((Math.sin(time * 0.9) + 1) / 2));
  const width = 4 + audio.bass * 22 + params.intensity * 0.08;
  const hue = (time * 36 + audio.treble * 150) % 360;

  for (let offset = -width; offset <= width; offset += 1) {
    const distance = Math.abs(offset) / width;
    const color = helpers.hsv(hue + offset * 2, 0.85, (1 - distance) * (0.35 + audio.volume));
    helpers.addPixel(leds, center + Math.round(offset), color);
  }

  if (audio.beat) {
    for (let i = 0; i < leds.length; i += 9) {
      helpers.addPixel(leds, i, palette(i / leds.length + time * 0.1, 1));
    }
  }
}`;

const palettes = {
  Aurora: [
    [25, 120, 110],
    [84, 210, 164],
    [242, 193, 78],
    [229, 88, 88],
    [115, 95, 220],
  ],
  Heat: [
    [8, 8, 8],
    [124, 20, 12],
    [229, 74, 26],
    [255, 178, 66],
    [255, 245, 170],
  ],
  Ocean: [
    [8, 20, 46],
    [18, 92, 128],
    [37, 169, 190],
    [126, 224, 203],
    [236, 250, 228],
  ],
  Candy: [
    [255, 85, 156],
    [255, 199, 95],
    [109, 226, 167],
    [70, 170, 255],
    [180, 111, 255],
  ],
};

const state = {
  ledCount: 150,
  layout: "strip",
  matrixWidth: 30,
  brightness: 180,
  speed: 128,
  intensity: 160,
  effectName: "Audio Spectrum",
  paletteName: "Aurora",
  leds: [],
  frame: 0,
  lastTime: performance.now(),
  compiledCustom: null,
  customCode: localStorage.getItem("edc-wled-custom-effect") || defaultCustomEffect,
};

const audio = {
  context: null,
  analyser: null,
  source: null,
  mediaElementSource: null,
  outputConnected: false,
  stream: null,
  timeData: new Uint8Array(2048),
  freqData: new Uint8Array(1024),
  bins: new Float32Array(64),
  volume: 0,
  smoothedVolume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: false,
  beatEnergy: 0,
  lastBeatAt: 0,
  bpm: 0,
};

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function makePalette(name) {
  const colors = palettes[name] || palettes.Aurora;
  return (position, brightness = 1) => {
    const p = wrap01(position) * colors.length;
    const index = Math.floor(p) % colors.length;
    const next = (index + 1) % colors.length;
    const t = p - Math.floor(p);
    return [
      mix(colors[index][0], colors[next][0], t) * brightness,
      mix(colors[index][1], colors[next][1], t) * brightness,
      mix(colors[index][2], colors[next][2], t) * brightness,
    ];
  };
}

const helpers = {
  hsv,
  clamp,
  fill(leds, color) {
    for (let i = 0; i < leds.length; i += 1) {
      leds[i][0] = color[0];
      leds[i][1] = color[1];
      leds[i][2] = color[2];
    }
  },
  fade(leds, amount) {
    for (const led of leds) {
      led[0] *= amount;
      led[1] *= amount;
      led[2] *= amount;
    }
  },
  setPixel(leds, index, color) {
    if (index < 0 || index >= leds.length) return;
    leds[index][0] = color[0];
    leds[index][1] = color[1];
    leds[index][2] = color[2];
  },
  addPixel(leds, index, color) {
    if (index < 0 || index >= leds.length) return;
    leds[index][0] += color[0];
    leds[index][1] += color[1];
    leds[index][2] += color[2];
  },
  mirror(leds) {
    const half = Math.floor(leds.length / 2);
    for (let i = 0; i < half; i += 1) {
      const source = leds[i];
      const target = leds[leds.length - 1 - i];
      target[0] = source[0];
      target[1] = source[1];
      target[2] = source[2];
    }
  },
};

function resetLeds() {
  state.leds = Array.from({ length: state.ledCount }, () => [0, 0, 0]);
}

function resizeCanvases() {
  const ratio = window.devicePixelRatio || 1;
  for (const target of [canvas, spectrumCanvas]) {
    const rect = target.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
  }
}

function updateAudio() {
  if (!audio.analyser) {
    audio.beat = false;
    return;
  }

  audio.analyser.getByteTimeDomainData(audio.timeData);
  audio.analyser.getByteFrequencyData(audio.freqData);

  let rms = 0;
  for (let i = 0; i < audio.timeData.length; i += 1) {
    const centered = (audio.timeData[i] - 128) / 128;
    rms += centered * centered;
  }
  audio.volume = clamp(Math.sqrt(rms / audio.timeData.length) * 2.3, 0, 1);
  audio.smoothedVolume = mix(audio.smoothedVolume, audio.volume, 0.18);

  const nyquist = audio.context.sampleRate / 2;
  const hzPerBin = nyquist / audio.freqData.length;

  function rangeAverage(fromHz, toHz) {
    const from = Math.max(0, Math.floor(fromHz / hzPerBin));
    const to = Math.min(audio.freqData.length - 1, Math.ceil(toHz / hzPerBin));
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i += 1) {
      sum += audio.freqData[i] / 255;
      count += 1;
    }
    return count ? sum / count : 0;
  }

  audio.bass = rangeAverage(20, 180);
  audio.mid = rangeAverage(180, 2200);
  audio.treble = rangeAverage(2200, 9000);

  for (let i = 0; i < audio.bins.length; i += 1) {
    const start = Math.floor((i / audio.bins.length) ** 1.8 * audio.freqData.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / audio.bins.length) ** 1.8 * audio.freqData.length));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += audio.freqData[j] / 255;
    audio.bins[i] = sum / (end - start);
  }

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

const effects = {
  "Audio Spectrum"({ leds, time, audio: audioData, palette, params }) {
    helpers.fade(leds, 0.68);
    const bars = Math.min(audioData.bins.length, leds.length);
    const gain = 0.9 + params.intensity / 100;
    for (let i = 0; i < bars; i += 1) {
      const bin = clamp(audioData.bins[i] * gain, 0, 1);
      const start = Math.floor((i / bars) * leds.length);
      const end = Math.floor(((i + 1) / bars) * leds.length);
      for (let px = start; px < end; px += 1) {
        const shimmer = 0.7 + 0.3 * Math.sin(time * 7 + px * 0.13);
        helpers.setPixel(leds, px, palette(i / bars + time * 0.035, bin * shimmer));
      }
    }
  },
  "Bass Ripple"({ leds, time, audio: audioData, palette, params }) {
    helpers.fade(leds, 0.72);
    const speed = 0.4 + params.speed / 80;
    const pulse = audioData.bass * (0.7 + params.intensity / 180);
    for (let i = 0; i < leds.length; i += 1) {
      const distance = Math.abs(i / leds.length - 0.5);
      const wave = (Math.sin(distance * 46 - time * speed * 8) + 1) / 2;
      helpers.addPixel(leds, i, palette(distance + time * 0.06, wave * pulse));
    }
  },
  "Beat Sparks"({ leds, time, audio: audioData, palette, params }) {
    helpers.fade(leds, 0.88 - params.speed / 3600);
    if (audioData.beat || Math.random() < audioData.treble * 0.08) {
      const count = 2 + Math.floor(audioData.volume * 12 + params.intensity / 45);
      for (let i = 0; i < count; i += 1) {
        const index = Math.floor(Math.random() * leds.length);
        helpers.addPixel(leds, index, palette(Math.random() + time * 0.08, 1));
      }
    }
  },
  "WLED Rainbow"({ leds, time, params }) {
    const speed = 0.02 + params.speed / 1600;
    for (let i = 0; i < leds.length; i += 1) {
      const hue = i * (360 / leds.length) + time * speed * 360;
      helpers.setPixel(leds, i, hsv(hue, 0.92, 0.35 + params.intensity / 392));
    }
  },
  "Custom"({ leds, time, frame, audio: audioData, palette, params }) {
    if (!state.compiledCustom) compileCustomEffect();
    if (state.compiledCustom) {
      state.compiledCustom({ leds, time, frame, audio: audioData, params, palette, helpers });
    }
  },
};

function compileCustomEffect() {
  try {
    const source = ui.customEditor.value;
    const compiled = new Function(
      "api",
      `"use strict";\n${source}\nif (typeof render !== "function") throw new Error("Define function render(api)");\nreturn render(api);`
    );
    state.compiledCustom = compiled;
    state.customCode = source;
    localStorage.setItem("edc-wled-custom-effect", source);
    ui.error.textContent = "";
    state.effectName = "Custom";
    ui.effect.value = "Custom";
  } catch (error) {
    state.compiledCustom = null;
    ui.error.textContent = error.message;
  }
}

function drawLeds() {
  const width = canvas.width;
  const height = canvas.height;
  const brightness = state.brightness / 255;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080908";
  ctx.fillRect(0, 0, width, height);

  if (state.layout === "matrix") {
    const columns = clamp(state.matrixWidth, 1, state.ledCount);
    const rows = Math.ceil(state.ledCount / columns);
    const gap = Math.max(1, Math.min(width / columns, height / rows) * 0.13);
    const cell = Math.min((width - gap * (columns + 1)) / columns, (height - gap * (rows + 1)) / rows);
    const offsetX = (width - columns * cell - (columns - 1) * gap) / 2;
    const offsetY = (height - rows * cell - (rows - 1) * gap) / 2;

    for (let i = 0; i < state.leds.length; i += 1) {
      const row = Math.floor(i / columns);
      const rawColumn = i % columns;
      const column = row % 2 === 0 ? rawColumn : columns - 1 - rawColumn;
      paintLed(offsetX + column * (cell + gap), offsetY + row * (cell + gap), cell, brightness, state.leds[i]);
    }
  } else {
    const columns = Math.ceil(Math.sqrt(state.ledCount * (width / height)));
    const rows = Math.ceil(state.ledCount / columns);
    const gap = Math.max(1, Math.min(width / columns, height / rows) * 0.15);
    const cell = Math.min((width - gap * (columns + 1)) / columns, (height - gap * (rows + 1)) / rows);
    const offsetX = (width - columns * cell - (columns - 1) * gap) / 2;
    const offsetY = (height - rows * cell - (rows - 1) * gap) / 2;

    for (let i = 0; i < state.leds.length; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      paintLed(offsetX + column * (cell + gap), offsetY + row * (cell + gap), cell, brightness, state.leds[i]);
    }
  }
}

function paintLed(x, y, size, brightness, color) {
  const r = clamp(color[0] * brightness);
  const g = clamp(color[1] * brightness);
  const b = clamp(color[2] * brightness);
  const radius = Math.max(2, size * 0.44);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.9);
  glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
  glow.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.36)`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpectrum() {
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;
  spectrumCtx.clearRect(0, 0, width, height);
  spectrumCtx.fillStyle = "#080908";
  spectrumCtx.fillRect(0, 0, width, height);

  const palette = makePalette(state.paletteName);
  const gap = 2;
  const barWidth = width / audio.bins.length;
  for (let i = 0; i < audio.bins.length; i += 1) {
    const value = audio.bins[i];
    const barHeight = Math.max(2, value * height * 1.2);
    const color = palette(i / audio.bins.length, 0.95);
    spectrumCtx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    spectrumCtx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - gap), barHeight);
  }
}

function frame(now) {
  resizeCanvases();
  updateAudio();

  const time = now / 1000;
  const effect = effects[state.effectName] || effects["Audio Spectrum"];
  const params = {
    speed: state.speed,
    intensity: state.intensity,
    brightness: state.brightness,
  };

  try {
    effect({
      leds: state.leds,
      time,
      frame: state.frame,
      audio,
      params,
      palette: makePalette(state.paletteName),
      helpers,
    });
    if (state.effectName === "Custom") ui.error.textContent = "";
  } catch (error) {
    ui.error.textContent = error.message;
  }

  drawLeds();
  drawSpectrum();
  updateReadouts();
  state.frame += 1;
  requestAnimationFrame(frame);
}

function updateReadouts() {
  ui.bass.textContent = audio.bass.toFixed(2);
  ui.mid.textContent = audio.mid.toFixed(2);
  ui.treble.textContent = audio.treble.toFixed(2);
  ui.volume.textContent = audio.volume.toFixed(2);
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
    try {
      audio.source.disconnect();
    } catch {
      // Source may already be detached.
    }
    audio.source = null;
  }
  if (audio.analyser && audio.outputConnected) {
    try {
      audio.analyser.disconnect();
    } catch {
      // The analyser may already have no downstream nodes.
    }
    audio.outputConnected = false;
  }
  if (audio.stream) {
    for (const track of audio.stream.getTracks()) track.stop();
    audio.stream = null;
  }
}

async function startMic() {
  try {
    await ensureAudioContext();
    disconnectAudio();
    ui.audioPlayer.pause();
    audio.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    audio.source = audio.context.createMediaStreamSource(audio.stream);
    audio.source.connect(audio.analyser);
    ui.runtimeStatus.textContent = "Microphone input active";
  } catch (error) {
    ui.runtimeStatus.textContent = "Microphone unavailable";
    ui.error.textContent = error.message;
  }
}

async function loadAudioFile(file) {
  if (!file) return;
  try {
    await ensureAudioContext();
    disconnectAudio();
    const url = URL.createObjectURL(file);
    ui.audioPlayer.src = url;
    if (!audio.mediaElementSource) {
      audio.mediaElementSource = audio.context.createMediaElementSource(ui.audioPlayer);
    }
    audio.source = audio.mediaElementSource;
    audio.source.connect(audio.analyser);
    audio.analyser.connect(audio.context.destination);
    audio.outputConnected = true;
    await ui.audioPlayer.play();
    ui.runtimeStatus.textContent = `Playing ${file.name}`;
  } catch (error) {
    ui.runtimeStatus.textContent = "Audio file unavailable";
    ui.error.textContent = error.message;
  }
}

function stopAudio() {
  disconnectAudio();
  ui.audioPlayer.pause();
  ui.audioPlayer.removeAttribute("src");
  ui.audioPlayer.load();
  ui.runtimeStatus.textContent = "Audio stopped";
  audio.volume = 0;
  audio.smoothedVolume = 0;
  audio.bass = 0;
  audio.mid = 0;
  audio.treble = 0;
  audio.beat = false;
  audio.bins.fill(0);
}

function syncUi() {
  ui.customEditor.value = state.customCode;
  ui.effect.innerHTML = Object.keys(effects)
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
  ui.palette.innerHTML = Object.keys(palettes)
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
  ui.effect.value = state.effectName;
  ui.palette.value = state.paletteName;
}

function bindUi() {
  ui.startMic.addEventListener("click", startMic);
  ui.stopAudio.addEventListener("click", stopAudio);
  ui.audioFile.addEventListener("change", () => loadAudioFile(ui.audioFile.files[0]));
  ui.ledCount.addEventListener("change", () => {
    state.ledCount = clamp(parseInt(ui.ledCount.value, 10) || 150, 1, 2048);
    ui.ledCount.value = state.ledCount;
    resetLeds();
  });
  ui.layout.addEventListener("change", () => {
    state.layout = ui.layout.value;
  });
  ui.matrixWidth.addEventListener("change", () => {
    state.matrixWidth = clamp(parseInt(ui.matrixWidth.value, 10) || 30, 1, 128);
    ui.matrixWidth.value = state.matrixWidth;
  });
  ui.brightness.addEventListener("input", () => {
    state.brightness = parseInt(ui.brightness.value, 10);
  });
  ui.effect.addEventListener("change", () => {
    state.effectName = ui.effect.value;
  });
  ui.palette.addEventListener("change", () => {
    state.paletteName = ui.palette.value;
  });
  ui.speed.addEventListener("input", () => {
    state.speed = parseInt(ui.speed.value, 10);
  });
  ui.intensity.addEventListener("input", () => {
    state.intensity = parseInt(ui.intensity.value, 10);
  });
  ui.runCustom.addEventListener("click", compileCustomEffect);
  ui.resetCustom.addEventListener("click", () => {
    ui.customEditor.value = defaultCustomEffect;
    compileCustomEffect();
  });
  ui.customEditor.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = ui.customEditor.selectionStart;
      const end = ui.customEditor.selectionEnd;
      ui.customEditor.setRangeText("  ", start, end, "end");
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      compileCustomEffect();
    }
  });
}

syncUi();
bindUi();
resetLeds();
compileCustomEffect();
requestAnimationFrame(frame);
