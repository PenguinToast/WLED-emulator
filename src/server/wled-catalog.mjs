import { readFileSync } from "node:fs";
import { join } from "node:path";

import { vendorWledDir } from "./config.mjs";

const OFFICIAL_EFFECT_SLOTS = 187;
export const HOST_CUSTOM_EFFECT_ID = 187;

export function loadOfficialWledEffects() {
  const fxSource = readFileSync(join(vendorWledDir, "wled00/FX.cpp"), "utf8");
  const headerSource = readFileSync(join(vendorWledDir, "wled00/FX.h"), "utf8");
  const definitions = new Map();
  const modes = [];

  for (const match of fxSource.matchAll(/static const char (_data_[A-Z0-9_]+)\[\] PROGMEM = "([^"]*)";/g)) {
    definitions.set(match[1], match[2]);
  }
  for (const match of fxSource.matchAll(/addEffect\((FX_MODE_[A-Z0-9_]+),\s*&[^,]+,\s*(_data_[A-Z0-9_]+)/g)) {
    const idMatch = new RegExp(`#define\\s+${match[1]}\\s+(\\d+)`).exec(headerSource);
    if (!idMatch) continue;
    modes[Number(idMatch[1])] = definitions.get(match[2]) || "RSVD";
  }
  modes[0] = definitions.get("_data_FX_MODE_STATIC") || "Solid";

  const effects = [];
  const fxdata = [];
  for (let index = 0; index < OFFICIAL_EFFECT_SLOTS; index += 1) {
    const raw = modes[index] || "RSVD";
    const [name, data = ""] = raw.split("@");
    effects[index] = name;
    fxdata[index] = data;
  }
  effects[HOST_CUSTOM_EFFECT_ID] = "EDC Custom";
  fxdata[HOST_CUSTOM_EFFECT_ID] = "!,Width;!,!;!;01f";
  return { effects, fxdata };
}
