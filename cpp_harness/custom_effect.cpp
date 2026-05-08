#include "wled_effect_harness.hpp"
#include "generated/upstream_fx_1d.hpp"

// Paste this function body into WLED's FX.cpp (or a usermod that can register a
// mode function) and register it with addEffect(...). The host harness supplies
// the same SEGMENT/SEGENV/SEGLEN/SEGCOLOR/strip/audio symbols for local tests.
uint16_t mode_edc_custom(void) {
  if (SEGLEN == 0) return FRAMETIME;

  SEGMENT.fadeToBlackBy(38);

  const uint16_t len = SEGLEN;
  const uint16_t cycle = 384 + (255 - SEGMENT.speed) * 6;
  const uint16_t head = cycle ? ((strip.now % cycle) * len) / cycle : 0;
  const uint8_t baseWidth = 1 + ((uint16_t)SEGMENT.intensity * len) / 768;
  const uint8_t audioWidth = volumeSmth / 42;
  const uint8_t width = std::max<uint8_t>(2, baseWidth + audioWidth);
  const uint8_t paletteDrift = strip.now / 24;

  for (int offset = -int(width); offset <= int(width); offset += 1) {
    const uint16_t distance = std::abs(offset);
    const uint8_t level = 255 - (distance * 210 / width);
    const uint16_t pos = (head + len + offset) % len;
    const uint8_t colorIndex = uint8_t((pos * 255U) / std::max<uint16_t>(1, len - 1) + paletteDrift);
    const uint32_t color = SEGMENT.color_from_palette(colorIndex, false, true, 0, level);
    SEGMENT.addPixelColor(pos, color);
  }

  if (samplePeak) {
    const uint8_t flash = constrain<uint8_t>(96 + SEGMENT.intensity / 2, 96, 224);
    for (uint16_t i = 0; i < len; i += std::max<uint16_t>(1, len / 12)) {
      SEGMENT.addPixelColor(i, color_blend(SEGCOLOR(0), WHITE, flash));
    }
  }

  const uint8_t shimmer = fftResult[(SEGENV.call / 2) % 16];
  if (shimmer > 36) {
    const uint16_t sparkleCount = 1 + shimmer / 84;
    for (uint16_t i = 0; i < sparkleCount; i += 1) {
      const uint16_t pos = random16(len);
      SEGMENT.addPixelColor(pos, SEGMENT.color_from_palette(random8() + paletteDrift, false, true, 0, shimmer));
    }
  }

  return FRAMETIME;
}

void render(EffectContext& ctx) {
  prepareWledFrame(ctx);
  const uint8_t mode = SEGMENT.mode;

  if (mode == FX_MODE_EDC_CUSTOM) {
    mode_edc_custom();
  } else if (UpstreamModePtr upstream = upstreamModeFor(mode)) {
    upstream();
  } else {
    SEGMENT.fill(BLACK);
  }

  finishWledFrame(ctx);
}
