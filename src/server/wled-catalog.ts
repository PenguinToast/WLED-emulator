import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rootDir, vendorWledDir } from "./config.js";

const OFFICIAL_EFFECT_SLOTS = 187;
export const HOST_CUSTOM_EFFECT_ID = 187;
const nativeEffectManifestPath = join(rootDir, "cpp_harness/generated/upstream_fx_1d_modes.json");

export function loadOfficialWledEffects() {
  const fxSource = readFileSync(join(vendorWledDir, "wled00/FX.cpp"), "utf8");
  const headerSource = readFileSync(join(vendorWledDir, "wled00/FX.h"), "utf8");
  const supportedModes = loadNativeSupportedModes();
  const definitions = new Map();
  const modes = [];

  for (const match of fxSource.matchAll(/static const char (_data_[A-Z0-9_]+)\[\] PROGMEM = "([^"]*)";/g)) {
    definitions.set(match[1], match[2]);
  }
  for (const match of fxSource.matchAll(/addEffect\((FX_MODE_[A-Z0-9_]+),\s*&[^,]+,\s*(_data_[A-Z0-9_]+)/g)) {
    const idMatch = new RegExp(`#define\\s+${match[1]}\\s+(\\d+)`).exec(headerSource);
    if (!idMatch) continue;
    if (supportedModes.has(match[1])) modes[Number(idMatch[1])] = definitions.get(match[2]) || "RSVD";
  }
  if (supportedModes.has("FX_MODE_STATIC")) modes[0] = definitions.get("_data_FX_MODE_STATIC") || "Solid";

  const effects = [];
  const fxdata = [];
  for (let index = 0; index < OFFICIAL_EFFECT_SLOTS; index += 1) {
    const raw = modes[index] || "RSVD";
    const [name, data = ""] = raw.split("@");
    effects[index] = name;
    fxdata[index] = data;
  }
  effects[HOST_CUSTOM_EFFECT_ID] = "EDC Custom";
  fxdata[HOST_CUSTOM_EFFECT_ID] = "Speed,Sensitivity,Tightness,Bass Adapt,Accent Gate;!,!,!;!;1vf;sx=192,ix=190,c1=190,c2=178,c3=12,pal=4,m12=2,si=0";
  return { effects, fxdata };
}

function loadNativeSupportedModes() {
  const manifest = JSON.parse(readFileSync(nativeEffectManifestPath, "utf8"));
  return new Set(
    (Array.isArray(manifest.modes) ? manifest.modes : [])
      .map((mode) => mode?.name)
      .filter(Boolean),
  );
}
