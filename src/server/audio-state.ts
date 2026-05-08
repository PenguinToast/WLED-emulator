import { clamp } from "./util.js";

export function updateAudioState(ctx, value) {
  const bins = Array.isArray(value?.bins)
    ? value.bins.slice(0, 16).map((bin) => clamp(Number(bin ?? 0), 0, 1))
    : ctx.audio.bins;
  while (bins.length < 16) bins.push(0);
  Object.assign(ctx.audio, {
    volume: clamp(Number(value?.volume ?? 0), 0, 1),
    bass: clamp(Number(value?.bass ?? 0), 0, 1),
    mid: clamp(Number(value?.mid ?? 0), 0, 1),
    treble: clamp(Number(value?.treble ?? 0), 0, 1),
    beat: Boolean(value?.beat),
    bpm: clamp(Number(value?.bpm ?? 0), 0, 300),
    majorPeak: clamp(Number(value?.majorPeak ?? 0), 0, 11025),
    magnitude: clamp(Number(value?.magnitude ?? 0), 0, 1),
    bins,
    source: String(value?.source || "browser"),
    updatedAt: Date.now(),
  });
  return ctx.audio;
}

export function audioMessage(audio) {
  return {
    type: "audio",
    source: audio.source || "browser",
    volume: audio.volume,
    bass: audio.bass,
    mid: audio.mid,
    treble: audio.treble,
    beat: audio.beat,
    bpm: audio.bpm,
    majorPeak: audio.majorPeak,
    magnitude: audio.magnitude,
    bins: audio.bins,
    updatedAt: audio.updatedAt,
  };
}
