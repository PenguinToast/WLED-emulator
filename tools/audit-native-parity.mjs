import { readFileSync } from "node:fs";

const harness = readFileSync("cpp_harness/wled_effect_harness.hpp", "utf8");
const compat = readFileSync("cpp_harness/wled_compat.cpp", "utf8");
const generated = readFileSync("cpp_harness/generated/upstream_fx_1d.cpp", "utf8");
const manifest = JSON.parse(readFileSync("cpp_harness/generated/upstream_fx_1d_modes.json", "utf8"));
const uncommentedGenerated = generated.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const failures = [];

expect("HostSegment::step is WLED's 32-bit runtime field", /uint32_t\s+step\s*=\s*0;/.test(harness));
expect("HostSegment::call is WLED's 32-bit runtime field", /uint32_t\s+call\s*=\s*0;/.test(harness));
expect("HostSegment::aux0 is WLED's 16-bit runtime field", /uint16_t\s+aux0\s*=\s*0;/.test(harness));
expect("HostSegment::aux1 is WLED's 16-bit runtime field", /uint16_t\s+aux1\s*=\s*0;/.test(harness));
expect("SEGENV.data storage is max-aligned for upstream typed casts", /std::vector<std::max_align_t>\s+storage;/.test(harness));
expect("CRGBPalette16 has FastLED's 16 RGB entries", /std::array<CRGB,\s*16>\s+entries/.test(harness));
expect("SEGPALETTE is driven by the current segment palette", /#define\s+SEGPALETTE\s+currentSegmentPalette\(\)/.test(harness));
expect("currentSegmentPalette is implemented in the compatibility layer", /CRGBPalette16\s+currentSegmentPalette\(\)/.test(compat));
expect("AudioReactive u_data[1] is backed by int16_t volumeRaw", /int16_t\s+volumeRaw\s*=/.test(compat) && /&volumeRaw/.test(compat));
expect("generated audio effects do not cast u_data[1] to float", !/\*\(float\s*\*\)\s*um_data->u_data\[1\]/.test(uncommentedGenerated));

expect("native manifest modeCount matches mode list length", manifest.modeCount === manifest.modes.length);
for (const mode of manifest.modes) {
  const fn = mode?.function;
  if (!fn) {
    failures.push(`mode ${mode?.id ?? "?"} is missing a function name`);
    continue;
  }
  const body = effectBody(fn);
  expect(`${mode.name} dispatch target ${fn} exists`, body !== null);
  if (body && /!strip\.isMatrix\s*\|\|\s*!SEGMENT\.is2D\(\)\)\s*return mode_static/.test(body.slice(0, 500))) {
    failures.push(`${mode.name} is exposed but its native function is matrix-only`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Native parity audit passed for ${manifest.modes.length} supported upstream modes.`);

function expect(label, ok) {
  if (!ok) failures.push(label);
}

function effectBody(functionName) {
  const startMatch = new RegExp(`void\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`, "g").exec(generated);
  if (!startMatch) return null;
  let depth = 1;
  let cursor = startMatch.index + startMatch[0].length;
  while (cursor < generated.length && depth > 0) {
    const char = generated[cursor];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    cursor += 1;
  }
  return generated.slice(startMatch.index, cursor);
}
