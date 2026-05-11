#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { once } from "node:events";

const sampleRate = 44100;
const frameRate = 60;
const frameStep = Math.round(sampleRate / frameRate);
const windowSize = 2048;
const pcSyncLowHz = 40;
const pcSyncHighHz = 10000;
const beatLowHz = 100;
const beatHighHz = 500;
const beatHistoryLength = 50;
const beatThreshold = 1.2;
const truthMinBpm = 78;
const truthMaxBpm = 190;
const ringStops = [1, 9, 21, 37, 61, 93, 133];
const defaultSeconds = 75;
const defaultOffset = 15;

const args = parseArgs(process.argv.slice(2));
if (!args.files.length) {
  console.error("Usage: node tools/evaluate-edc-audio.mjs [--seconds 75] [--offset 15] [--impact 190] [--truth-bpm 128] <track.mp3> [...]");
  process.exit(1);
}

buildHarness();

for (const file of args.files) {
  if (!existsSync(file)) {
    console.error(`Missing audio file: ${file}`);
    process.exitCode = 1;
    continue;
  }
  const samples = decodeAudio(file, args.seconds, args.offset);
  const frames = analyzeFrames(samples);
  const metrics = await renderAndMeasure(frames);
  printMetrics(file, metrics);
}

function parseArgs(values) {
  const result = {
    seconds: defaultSeconds,
    offset: defaultOffset,
    speed: 192,
    beatFocus: 150,
    tightness: 190,
    impact: 190,
    accentMix: 18,
    truthBpm: 0,
    files: [],
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--seconds") result.seconds = Number(values[++index] || defaultSeconds);
    else if (value === "--offset") result.offset = Number(values[++index] || defaultOffset);
    else if (value === "--speed") result.speed = Number(values[++index] || result.speed);
    else if (value === "--beat-focus") result.beatFocus = Number(values[++index] || result.beatFocus);
    else if (value === "--tightness") result.tightness = Number(values[++index] || result.tightness);
    else if (value === "--impact") result.impact = Number(values[++index] || result.impact);
    else if (value === "--accent-mix") result.accentMix = Number(values[++index] || result.accentMix);
    else if (value === "--truth-bpm") result.truthBpm = Number(values[++index] || 0);
    else result.files.push(value);
  }
  return result;
}

function buildHarness() {
  const result = spawnSync("c++", [
    "-std=c++17",
    "-O2",
    "-Icpp_harness",
    "cpp_harness/main.cpp",
    "cpp_harness/custom_effect.cpp",
    "cpp_harness/edc_usermod.cpp",
    "cpp_harness/wled_compat.cpp",
    "cpp_harness/generated/upstream_fx_1d.cpp",
    "-o",
    "/private/tmp/edc-wled-cpp-effect-eval",
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function decodeAudio(file, seconds, offset) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(offset),
    "-t",
    String(seconds),
    "-i",
    file,
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-f",
    "f32le",
    "pipe:1",
  ], { encoding: "buffer", maxBuffer: 1024 * 1024 * 512 });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${file}: ${result.stderr?.toString("utf8") || "unknown error"}`);
  }
  const samples = new Float32Array(result.stdout.buffer, result.stdout.byteOffset, Math.floor(result.stdout.byteLength / 4));
  return new Float32Array(samples);
}

function analyzeFrames(samples) {
  const freqPoints = logFrequencyPoints(pcSyncLowHz, pcSyncHighHz, 16);
  const frames = [];
  let agcSpan = 0.05;
  let agcInitialized = false;
  const smoothedBins = new Array(16).fill(0);
  const beatHistory = [];
  let lastBeatAt = -Infinity;
  let bpm = 0;
  let previousBeatEnergy = 0;

  for (let start = 0; start + windowSize <= samples.length; start += frameStep) {
    const timeMs = (start / sampleRate) * 1000;
    const window = samples.subarray(start, start + windowSize);
    const rms = windowRms(window);
    const rawBands = freqPoints.slice(0, -1).map((fromHz, index) => {
      const toHz = freqPoints[index + 1];
      return maxGoertzel(window, fromHz, toHz);
    });
    const bucketMax = Math.max(...rawBands);
    if (!agcInitialized) {
      agcInitialized = true;
      agcSpan = Math.max(bucketMax, 0.05);
    } else if (bucketMax > agcSpan) {
      agcSpan = mix(agcSpan, bucketMax, 0.75);
    } else {
      agcSpan = mix(agcSpan, Math.max(bucketMax, 0.05), 0.1);
    }

    const bins = rawBands.map((value, index) => {
      const normalized = Math.sqrt(clamp(value / Math.max(agcSpan, 0.0001), 0, 1));
      const attack = normalized > smoothedBins[index] ? 0.75 : 0.14;
      smoothedBins[index] = mix(smoothedBins[index], normalized, attack);
      return smoothedBins[index];
    });

    const beatBand = maxGoertzel(window, beatLowHz, beatHighHz);
    const currentBeat = Math.sqrt(clamp(beatBand / Math.max(agcSpan, 0.0001), 0, 1));
    const onset = Math.max(0, currentBeat - previousBeatEnergy);
    previousBeatEnergy = mix(previousBeatEnergy, currentBeat, currentBeat > previousBeatEnergy ? 0.38 : 0.08);
    const ready = beatHistory.length >= beatHistoryLength;
    const averageBeat = beatHistory.reduce((sum, value) => sum + value, 0) / Math.max(1, beatHistory.length);
    const beat = ready && currentBeat > averageBeat * beatThreshold && currentBeat > 0.08 && timeMs - lastBeatAt > 120;
    beatHistory.push(currentBeat);
    if (beatHistory.length > beatHistoryLength) beatHistory.shift();
    if (beat) {
      if (Number.isFinite(lastBeatAt)) {
        const instantBpm = 60000 / (timeMs - lastBeatAt);
        if (instantBpm > 60 && instantBpm < 190) bpm = bpm ? mix(bpm, instantBpm, 0.2) : instantBpm;
      }
      lastBeatAt = timeMs;
    }

    const bass = Math.max(...bins.slice(0, 4));
    const mid = Math.max(...bins.slice(4, 11));
    const treble = Math.max(...bins.slice(11, 16));
    const major = strongestBand(rawBands, freqPoints);
    frames.push({
      time: start / sampleRate,
      volume: clamp(rms * 1.45, 0, 1),
      bass,
      mid,
      treble,
      beat,
      onset,
      bpm,
      majorPeak: major.frequency,
      magnitude: clamp(major.magnitude / Math.max(agcSpan, 0.0001), 0, 1),
      bins,
    });
  }
  return frames;
}

async function renderAndMeasure(frames) {
  const child = spawn("/private/tmp/edc-wled-cpp-effect-eval", [], { stdio: ["pipe", "pipe", "inherit"] });
  let pending = "";
  const outputs = [];
  child.stdout.on("data", (chunk) => {
    pending += chunk.toString("utf8");
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("F ")) outputs.push(line.slice(2).trim());
    }
  });

  for (let frame = 0; frame < frames.length; frame += 1) {
    child.stdin.write(inputLine(frames[frame], frame));
  }
  child.stdin.end();
  await once(child, "exit");

  const analyzerBeats = frames
    .map((frame, index) => frame.beat ? frame.time * 1000 : null)
    .filter((value) => value !== null);
  const truth = tempoGridTruth(frames, args.truthBpm);
  const audioBeats = truth.beats;
  const visual = outputs.map((rgb, index) => frameBrightness(rgb, index / frameRate));
  const visualHits = detectVisualHits(visual);
  const matches = matchHits(audioBeats, visualHits);
  const tailDuty = visual.length
    ? visual.filter((frame) => frame.total > 28 && !nearAny(frame.timeMs, audioBeats, 300)).length / visual.length
    : 0;
  return {
    duration: frames.length / frameRate,
    analyzerBeats: analyzerBeats.length,
    truthBpm: truth.bpm,
    truthConfidence: truth.confidence,
    truthReliable: truth.confidence >= 2,
    audioBeats: audioBeats.length,
    visualHits: visualHits.length,
    matched: matches.length,
    recall: audioBeats.length ? matches.length / audioBeats.length : 0,
    precision: visualHits.length ? matches.length / visualHits.length : 0,
    medianLagMs: median(matches.map((match) => match.visual - match.audio)),
    tailDuty,
    averageTotal: average(visual.map((frame) => frame.total)),
    maxTotal: Math.max(0, ...visual.map((frame) => frame.total)),
  };
}

function inputLine(frame, index) {
  const fields = [
    frame.time.toFixed(3),
    index,
    180,
    ringStops.length,
    frame.volume.toFixed(4),
    frame.bass.toFixed(4),
    frame.mid.toFixed(4),
    frame.treble.toFixed(4),
    frame.beat ? 1 : 0,
    frame.bpm.toFixed(1),
    frame.majorPeak.toFixed(1),
    frame.magnitude.toFixed(4),
    frame.bins.length,
    ...frame.bins.map((value) => value.toFixed(4)),
    1,
    0,
    1,
    22,
    8,
    42,
    128,
    118,
  ];
  let start = 0;
  for (let ring = 0; ring < ringStops.length; ring += 1) {
    fields.push(
      ring,
      start,
      ringStops[ring],
      255,
      187,
      args.speed,
      args.beatFocus,
      args.tightness,
      args.impact,
      args.accentMix,
      0,
      0,
      0,
      0,
      4,
      1,
      255,
      112,
      24,
      0,
      180,
      255,
      245,
      245,
      255,
    );
    start = ringStops[ring];
  }
  return `${fields.join(" ")}\n`;
}

function frameBrightness(rgb, timeSeconds) {
  const rings = [];
  let offset = 0;
  let start = 0;
  for (const stop of ringStops) {
    let sum = 0;
    for (let led = start; led < stop; led += 1) {
      const r = Number.parseInt(rgb.slice(offset, offset + 2), 16) || 0;
      const g = Number.parseInt(rgb.slice(offset + 2, offset + 4), 16) || 0;
      const b = Number.parseInt(rgb.slice(offset + 4, offset + 6), 16) || 0;
      sum += Math.max(r, g, b);
      offset += 6;
    }
    rings.push(sum / Math.max(1, stop - start));
    start = stop;
  }
  return {
    timeMs: timeSeconds * 1000,
    center: (rings[0] + rings[1] + rings[2]) / 3,
    total: average(rings),
  };
}

function detectVisualHits(frames) {
  const hits = [];
  let previous = 0;
  let lastHit = -Infinity;
  for (const frame of frames) {
    const energy = frame.center * 0.72 + frame.total * 0.28;
    const rise = energy - previous;
    if (energy > 32 && rise > Math.max(7, previous * 0.28) && frame.timeMs - lastHit > 120) {
      hits.push(frame.timeMs);
      lastHit = frame.timeMs;
    }
    previous = mix(previous, energy, 0.45);
  }
  return hits;
}

function tempoGridTruth(frames, overrideBpm) {
  const durationMs = frames.length ? frames[frames.length - 1].time * 1000 : 0;
  const onsets = frames.map((frame) => Math.pow(clamp(frame.onset * 3.2, 0, 1), 1.35));
  const lag = overrideBpm > 0 ? Math.max(1, Math.round((60 * frameRate) / overrideBpm)) : estimateBeatLag(onsets);
  const phase = estimateBeatPhase(onsets, lag);
  const beats = [];
  const startTimeMs = (phase / frameRate) * 1000;
  const intervalMs = (lag / frameRate) * 1000;
  for (let timeMs = startTimeMs; timeMs <= durationMs + intervalMs * 0.35; timeMs += intervalMs) {
    if (timeMs >= 0 && timeMs <= durationMs) beats.push(timeMs);
  }
  return {
    beats,
    bpm: 60 * frameRate / lag,
    confidence: tempoConfidence(onsets, lag, phase),
  };
}

function estimateBeatLag(onsets) {
  let bestLag = Math.round((60 * frameRate) / 128);
  let bestScore = -Infinity;
  const minLag = Math.floor((60 * frameRate) / truthMaxBpm);
  const maxLag = Math.ceil((60 * frameRate) / truthMinBpm);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    let count = 0;
    for (let index = lag; index < onsets.length; index += 1) {
      score += onsets[index] * onsets[index - lag];
      count += 1;
    }
    score /= Math.max(1, count);
    const bpm = 60 * frameRate / lag;
    const houseTempoBias = 1 - Math.min(0.18, Math.abs(bpm - 128) / 480);
    score *= houseTempoBias;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestLag;
}

function estimateBeatPhase(onsets, lag) {
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < lag; phase += 1) {
    let score = 0;
    let count = 0;
    for (let index = phase; index < onsets.length; index += lag) {
      score += onsets[index] + 0.55 * Math.max(onsets[index - 1] || 0, onsets[index + 1] || 0);
      count += 1;
    }
    score /= Math.max(1, count);
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

function tempoConfidence(onsets, lag, phase) {
  const gridValues = [];
  const offValues = [];
  for (let index = 0; index < onsets.length; index += 1) {
    const distance = Math.abs(((index - phase + Math.floor(lag / 2)) % lag) - Math.floor(lag / 2));
    if (distance <= 1) gridValues.push(onsets[index]);
    else if (distance >= Math.max(3, Math.floor(lag / 4))) offValues.push(onsets[index]);
  }
  return average(gridValues) / Math.max(0.0001, average(offValues));
}

function matchHits(audioBeats, visualHits) {
  const matches = [];
  const used = new Set();
  for (const audio of audioBeats) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < visualHits.length; index += 1) {
      if (used.has(index)) continue;
      const distance = Math.abs(visualHits[index] - audio);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0 && bestDistance <= 180) {
      used.add(bestIndex);
      matches.push({ audio, visual: visualHits[bestIndex] });
    }
  }
  return matches;
}

function thinBeats(beats, minGapMs) {
  const result = [];
  for (const beat of beats) {
    if (!result.length || beat - result[result.length - 1] >= minGapMs) result.push(beat);
  }
  return result;
}

function maxGoertzel(samples, fromHz, toHz) {
  const probes = 5;
  let max = 0;
  for (let probe = 0; probe < probes; probe += 1) {
    const t = (probe + 0.5) / probes;
    const hz = fromHz * Math.pow(toHz / fromHz, t);
    max = Math.max(max, goertzelMagnitude(samples, hz));
  }
  return max;
}

function goertzelMagnitude(samples, frequency) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (samples.length - 1));
    q0 = coeff * q1 - q2 + samples[index] * window;
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * Math.cos(omega);
  const imag = q2 * Math.sin(omega);
  return (2 * Math.sqrt(real * real + imag * imag)) / samples.length;
}

function windowRms(samples) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function strongestBand(values, points) {
  let index = 0;
  for (let next = 1; next < values.length; next += 1) {
    if (values[next] > values[index]) index = next;
  }
  return {
    frequency: Math.sqrt(points[index] * points[index + 1]),
    magnitude: values[index],
  };
}

function logFrequencyPoints(lowHz, highHz, count) {
  const result = [];
  for (let index = 0; index <= count; index += 1) {
    result.push(lowHz * Math.pow(highHz / lowHz, index / count));
  }
  return result;
}

function nearAny(value, candidates, distance) {
  return candidates.some((candidate) => Math.abs(candidate - value) <= distance);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function printMetrics(file, metrics) {
  console.log(JSON.stringify({
    track: basename(file),
    durationSeconds: Number(metrics.duration.toFixed(1)),
    analyzerPeaks: metrics.analyzerBeats,
    truthBpm: Number(metrics.truthBpm.toFixed(1)),
    truthConfidence: Number(metrics.truthConfidence.toFixed(2)),
    truthReliable: metrics.truthReliable,
    truthBeats: metrics.audioBeats,
    visualHits: metrics.visualHits,
    matched: metrics.matched,
    recall: Number(metrics.recall.toFixed(3)),
    precision: Number(metrics.precision.toFixed(3)),
    medianLagMs: Math.round(metrics.medianLagMs),
    tailDuty: Number(metrics.tailDuty.toFixed(3)),
    averageTotal: Number(metrics.averageTotal.toFixed(1)),
    maxTotal: Number(metrics.maxTotal.toFixed(1)),
  }));
}
