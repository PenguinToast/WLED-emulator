import { createRingSegments, ringNames } from "./fixture.js";
import { palettes } from "./palettes.js";
import { clampInt, clone, deepMerge } from "./util.js";

export function createInitialState() {
  return {
    on: true,
    bri: 180,
    transition: 7,
    ps: -1,
    pl: -1,
    nl: { on: false, dur: 60, fade: true, mode: 1, tbri: 0, rem: 0 },
    udpn: { send: false, recv: false },
    lor: 0,
    mainseg: 0,
    ledmap: 0,
    AudioReactive: { on: true },
    seg: createRingSegments(),
  };
}

export function applyStateUpdate(state, patch, catalog) {
  if (!patch || typeof patch !== "object") return;
  let normalizedPatch = patch;
  if (Array.isArray(patch.seg)) {
    const next = clone(state.seg);
    for (const segPatch of patch.seg) {
      if (!segPatch || typeof segPatch !== "object") continue;
      mergeSegmentPatch(next, segPatch, catalog);
    }
    normalizedPatch = { ...patch, seg: next };
  } else if (patch.seg && typeof patch.seg === "object") {
    const next = clone(state.seg);
    const indexes = Number.isInteger(patch.seg.id)
      ? [segmentIndexById(next, patch.seg.id)]
      : selectedSegmentIndexes(next);
    for (const index of indexes) {
      mergeSegmentPatchAt(next, index, patch.seg, catalog);
    }
    normalizedPatch = { ...patch, seg: next };
  }
  deepMerge(state, normalizedPatch);
  normalizeState(state, catalog);
}

function segmentIndexById(segments, id) {
  const index = segments.findIndex((seg) => seg?.id === id);
  return index >= 0 ? index : segments.length;
}

function selectedSegmentIndexes(segments) {
  const indexes = segments
    .map((seg, index) => (seg?.sel ? index : -1))
    .filter((index) => index >= 0);
  return indexes.length ? indexes : [0];
}

function mergeSegmentPatch(segments, segPatch, catalog) {
  const targetIndex = Number.isInteger(segPatch.id) ? segmentIndexById(segments, segPatch.id) : 0;
  mergeSegmentPatchAt(segments, targetIndex, segPatch, catalog);
}

function mergeSegmentPatchAt(segments, targetIndex, segPatch, catalog) {
  const { col, fxdef, ...rest } = segPatch;
  const base = segments[targetIndex] || { id: targetIndex };
  const merged = clone(base);
  if (fxdef && Number.isInteger(rest.fx) && rest.fx !== base.fx) {
    deepMerge(merged, effectDefaults(catalog, rest.fx));
  }
  deepMerge(merged, rest);
  if (Array.isArray(col)) merged.col = mergeColorSlots(base.col, col);
  segments[targetIndex] = merged;
}

function effectDefaults(catalog, fx) {
  const defaults = {
    sx: 128,
    ix: 128,
    c1: 128,
    c2: 128,
    c3: 16,
    o1: false,
    o2: false,
    o3: false,
    m12: 0,
    si: undefined,
    pal: undefined,
    rev: undefined,
    mi: undefined,
  };
  const data = String(catalog?.fxdata?.[fx] || "");
  const defaultPart = data.split(";")[4] || "";
  for (const token of defaultPart.split(",")) {
    const [rawKey, rawValue] = token.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const value = clampInt(rawValue, 0, 255);
    if (key === "sx") defaults.sx = value;
    else if (key === "ix") defaults.ix = value;
    else if (key === "c1") defaults.c1 = value;
    else if (key === "c2") defaults.c2 = value;
    else if (key === "c3") defaults.c3 = clampInt(rawValue, 0, 31);
    else if (key === "o1") defaults.o1 = value !== 0;
    else if (key === "o2") defaults.o2 = value !== 0;
    else if (key === "o3") defaults.o3 = value !== 0;
    else if (key === "m12") defaults.m12 = clampInt(rawValue, 0, 255);
    else if (key === "si") defaults.si = clampInt(rawValue, 0, 255);
    else if (key === "pal") defaults.pal = clampInt(rawValue, 0, palettes.length - 1);
    else if (key === "rev") defaults.rev = value !== 0;
    else if (key === "mi") defaults.mi = value !== 0;
  }
  return defaults;
}

function mergeColorSlots(current, patch) {
  const next = normalizeColors(current);
  for (let index = 0; index < Math.min(3, patch.length); index += 1) {
    const color = patch[index];
    if (!Array.isArray(color) || color.length === 0) continue;
    next[index] = normalizeColors([color])[0];
  }
  return next;
}

export function normalizeState(state, catalog) {
  state.bri = clampInt(state.bri, 0, 255);
  state.seg = Array.isArray(state.seg) ? state.seg : [];
  if (!state.seg.length) {
    state.seg.push({ id: 0, start: 0, stop: 150, len: 150, sel: true });
  }
  state.seg = state.seg.map((seg, index) => {
    const start = clampInt(seg.start ?? 0, 0, 2047);
    const stop = clampInt(seg.stop ?? seg.len ?? 150, start + 1, 2048);
    return {
      id: seg.id ?? index,
      n: seg.n ?? ringNames[index] ?? `Segment ${index}`,
      start,
      stop,
      len: stop - start,
      grp: seg.grp ?? 1,
      spc: seg.spc ?? 0,
      of: seg.of ?? 0,
      set: clampInt(seg.set ?? 0, 0, 3),
      on: seg.on ?? true,
      frz: seg.frz ?? false,
      bri: clampInt(seg.bri ?? 255, 0, 255),
      col: normalizeColors(seg.col),
      fx: clampInt(seg.fx ?? 0, 0, catalog.effects.length - 1),
      sx: clampInt(seg.sx ?? 128, 0, 255),
      ix: clampInt(seg.ix ?? 128, 0, 255),
      c1: clampInt(seg.c1 ?? 128, 0, 255),
      c2: clampInt(seg.c2 ?? 128, 0, 255),
      c3: clampInt(seg.c3 ?? 16, 0, 31),
      o1: seg.o1 ?? false,
      o2: seg.o2 ?? false,
      o3: seg.o3 ?? false,
      si: clampInt(seg.si ?? 0, 0, 255),
      m12: clampInt(seg.m12 ?? 0, 0, 255),
      pal: clampInt(seg.pal ?? 0, 0, palettes.length - 1),
      sel: seg.sel ?? index === 0,
      rev: seg.rev ?? false,
      mi: seg.mi ?? false,
    };
  });
}

export function renderPreviewLeds(state) {
  const seg = state.seg[0];
  const count = seg?.len || 150;
  const base = seg?.col?.[0] || [255, 160, 80];
  return Array.from({ length: count }, (_, index) => {
    const scale = state.on && seg.on ? (0.35 + 0.65 * Math.sin(Date.now() / 350 + index * 0.18) ** 2) : 0;
    return base.slice(0, 3).map((channel) => Math.round(channel * scale));
  });
}

function normalizeColors(colors) {
  const fallback = [[255, 160, 80], [0, 0, 0], [0, 0, 0]];
  const source = Array.isArray(colors) ? colors : fallback;
  return [0, 1, 2].map((index) => {
    const color = Array.isArray(source[index]) ? source[index] : fallback[index];
    return [
      clampInt(color[0] ?? 0, 0, 255),
      clampInt(color[1] ?? 0, 0, 255),
      clampInt(color[2] ?? 0, 0, 255),
      ...(color.length > 3 ? [clampInt(color[3] ?? 0, 0, 255)] : []),
    ];
  });
}
