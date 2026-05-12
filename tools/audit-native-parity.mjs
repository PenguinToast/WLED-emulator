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
expect("CHSV32 keeps WLED's 16-bit hue field", /struct\s+CHSV32[\s\S]*uint16_t\s+h;/.test(harness) && !/using\s+CHSV32\s*=\s*CHSV/.test(harness));
expect("ColorFromPalette handles WLED's no-wrap linear blend", /blendType\s*==\s*LINEARBLEND_NOWRAP/.test(harness));
expect("color_add exposes WLED preserve-color-ratio mode", /color_add\s*\([^)]*bool\s+preserveCR\s*=\s*true/.test(harness) && /maxChannel\s*>\s*255/.test(harness));
expect("color_fade exposes WLED video scaling mode", /color_fade\s*\([^)]*bool\s+video\s*=\s*false/.test(harness) && /threshold\s*=\s*uint8_t\(\(maxChannel\s*>>\s*2\)\s*\+\s*1U\)/.test(harness));
expect("SEGPALETTE is driven by the current segment palette", /#define\s+SEGPALETTE\s+currentSegmentPalette\(\)/.test(harness));
expect("currentSegmentPalette is implemented in the compatibility layer", /CRGBPalette16\s+currentSegmentPalette\(\)/.test(compat));
expect("AudioReactive u_data follows WLED v16's 8-slot export", /um_data_t\s+hostAudioData\{8,\s*audioTypes,\s*audioValues\}/.test(compat));
expect("AudioReactive u_data[1] is backed by uint16_t volumeRaw", /uint16_t\s+volumeRaw\s*=/.test(compat) && /&volumeRaw/.test(compat) && /UMT_UINT16/.test(compat));
expect("AudioReactive u_data[3] is backed by samplePeak", /bool\s+samplePeak\s*=/.test(compat) && /&samplePeak/.test(compat));
expect("Host AudioReactive shim does not expose non-WLED fftBin slot", !/fftBin/.test(harness + compat));
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
