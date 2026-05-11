#include "wled_effect_harness.hpp"
#include "generated/upstream_fx_1d.hpp"

// Paste this function body into WLED's FX.cpp (or a usermod that can register a
// mode function) and register it with addEffect(...). The host harness supplies
// the same SEGMENT/SEGENV/SEGLEN/SEGCOLOR/strip/audio symbols for local tests.
struct EdcPulse {
  uint32_t born;
  uint8_t type;
  uint8_t strength;
  uint8_t hue;
};

struct EdcPulseState {
  uint8_t lastLow;
  uint8_t lastMid;
  uint8_t lastHigh;
  uint32_t lastKick;
  uint32_t lastSnare;
  uint32_t lastHat;
  uint8_t cursor;
  EdcPulse pulses[10];
};

static uint8_t edcMaxBin(uint8_t first, uint8_t last) {
  uint8_t result = 0;
  for (uint8_t index = first; index <= last && index < 16; index += 1) {
    if (fftResult[index] > result) result = fftResult[index];
  }
  return result;
}

static uint8_t edcScale8Video(uint8_t value, uint8_t scale) {
  return uint8_t(((uint16_t)value * scale) >> 8) + ((value && scale) ? 1 : 0);
}

static uint8_t edcRiseThreshold(uint8_t previous, uint8_t rise, uint8_t floor) {
  return std::max<uint8_t>(floor, uint8_t(std::min<uint16_t>(255, uint16_t(previous) + rise)));
}

static uint8_t edcRingIndex() {
  if (strip.getActiveSegmentsNum() <= 1) return 0;
  if (SEGMENT.start == 0) return 0;
  if (SEGMENT.start < 9) return 1;
  if (SEGMENT.start < 21) return 2;
  if (SEGMENT.start < 37) return 3;
  if (SEGMENT.start < 61) return 4;
  if (SEGMENT.start < 93) return 5;
  return 6;
}

static void edcSpawnPulse(EdcPulseState* state, uint8_t type, uint8_t strength, uint8_t hue) {
  EdcPulse& pulse = state->pulses[state->cursor % 10];
  pulse.born = strip.now;
  pulse.type = type;
  pulse.strength = strength;
  pulse.hue = hue;
  state->cursor = (state->cursor + 1) % 10;
}

static uint16_t edcPulseLife(uint8_t type) {
  if (type == 0) return 760 + (255 - SEGMENT.speed) * 2;
  if (type == 1) return 420;
  return 250;
}

static uint8_t edcPulseWidth(uint8_t type, uint16_t len) {
  uint8_t base = type == 0 ? 9 : (type == 1 ? 5 : 3);
  return std::max<uint8_t>(base, 2 + len / (type == 0 ? 8 : 15));
}

static void edcRenderRingPulse(const EdcPulse& pulse, uint32_t age, uint8_t ring, uint16_t len) {
  const uint16_t ringDelay = 34 + (255 - SEGMENT.speed) / 7;
  const uint32_t delayedAge = ring > 0 ? age - std::min<uint32_t>(age, ring * ringDelay) : age;
  if (age < ring * ringDelay) return;

  const uint16_t life = edcPulseLife(pulse.type);
  if (delayedAge > life) return;

  uint16_t envelope = 255 - (delayedAge * 255U) / life;
  if (pulse.type == 0 && delayedAge < 110) envelope = 255;
  const uint8_t ringFalloff = std::min<uint8_t>(72, ring * (pulse.type == 0 ? 7 : 11));
  const uint8_t ringEnvelope = envelope > ringFalloff ? uint8_t(envelope - ringFalloff) : 0;
  const uint8_t brightness = edcScale8Video(pulse.strength, ringEnvelope);
  if (brightness < 5) return;

  const uint8_t sat = pulse.type == 2 ? 55 : 220;
  const uint8_t phase = uint8_t(strip.now / (pulse.type == 0 ? 9 : 5));
  for (uint16_t i = 0; i < len; i += 1) {
    uint8_t shimmer = pulse.type == 0 ? 235 : sin8_t(uint8_t(i * (pulse.type == 1 ? 42 : 93) + phase));
    uint8_t value = edcScale8Video(brightness, shimmer);
    if (pulse.type == 0) value = std::max<uint8_t>(value, brightness / 2);
    SEGMENT.addPixelColor(i, CHSV(pulse.hue + ring * 3, sat, value));
  }
}

static void edcRenderStripPulse(const EdcPulse& pulse, uint32_t age, uint16_t len) {
  const uint16_t life = edcPulseLife(pulse.type);
  if (age > life) return;

  const uint16_t half = std::max<uint16_t>(1, len / 2);
  const uint16_t radius = std::min<uint16_t>(half + edcPulseWidth(pulse.type, len), (age * (half + edcPulseWidth(pulse.type, len))) / life);
  const uint8_t width = edcPulseWidth(pulse.type, len);
  const uint8_t sat = pulse.type == 2 ? 55 : 220;
  const uint8_t envelope = 255 - (age * 255U) / life;

  for (uint16_t i = 0; i < len; i += 1) {
    const uint16_t dist = i > half ? i - half : half - i;
    const uint16_t delta = radius > dist ? radius - dist : dist - radius;
    if (delta > width) continue;
    const uint8_t edge = 255 - (delta * 255U) / width;
    const uint8_t value = edcScale8Video(edcScale8Video(pulse.strength, envelope), edge);
    if (value > 4) SEGMENT.addPixelColor(i, CHSV(pulse.hue, sat, value));
  }
}

uint16_t mode_edc_custom(void) {
  if (SEGLEN == 0) return FRAMETIME;

  if (!SEGENV.allocateData(sizeof(EdcPulseState))) return mode_static();
  EdcPulseState* state = reinterpret_cast<EdcPulseState*>(SEGENV.data);

  const uint16_t len = SEGLEN;
  const uint8_t low = edcMaxBin(0, 3);
  const uint8_t mid = edcMaxBin(4, 10);
  const uint8_t high = edcMaxBin(11, 15);
  const uint8_t sensitivity = std::max<uint8_t>(32, SEGMENT.intensity);
  const uint8_t kickLevel = std::max<uint8_t>(low, clamp8(volumeSmth));
  const uint8_t kickHue = SEGMENT.custom1;
  const uint8_t accentHue = SEGMENT.custom2;
  const uint8_t sparkle = SEGMENT.custom3;

  const bool kick = (samplePeak && kickLevel > 46 && strip.now - state->lastKick > 135)
    || (low > edcRiseThreshold(state->lastLow, 34, 72) && low > mid * 7 / 10 && strip.now - state->lastKick > 155);
  const bool snare = mid > edcRiseThreshold(state->lastMid, 38, 68)
    && mid > low * 5 / 9
    && strip.now - state->lastSnare > 105;
  const bool hat = high > edcRiseThreshold(state->lastHigh, 28, 44)
    && high > mid * 3 / 5
    && strip.now - state->lastHat > 58;

  if (kick) {
    state->lastKick = strip.now;
    edcSpawnPulse(state, 0, std::max<uint8_t>(150, edcScale8Video(kickLevel, sensitivity)), kickHue);
  }
  if (snare && !kick) {
    state->lastSnare = strip.now;
    edcSpawnPulse(state, 1, std::max<uint8_t>(86, edcScale8Video(mid, sensitivity)), accentHue);
  }
  if (hat && sparkle > 0) {
    state->lastHat = strip.now;
    edcSpawnPulse(state, 2, std::max<uint8_t>(54, edcScale8Video(high, uint8_t(96 + sparkle * 5))), uint8_t(accentHue + 38));
  }

  state->lastLow = (state->lastLow * 5 + low) / 6;
  state->lastMid = (state->lastMid * 5 + mid) / 6;
  state->lastHigh = (state->lastHigh * 5 + high) / 6;

  SEGMENT.fadeToBlackBy(32 + (255 - SEGMENT.speed) / 8);

  const uint8_t ring = edcRingIndex();
  const bool ringMode = strip.getActiveSegmentsNum() > 1;
  for (uint8_t index = 0; index < 10; index += 1) {
    const EdcPulse& pulse = state->pulses[index];
    if (pulse.born == 0 || strip.now < pulse.born) continue;
    const uint32_t age = strip.now - pulse.born;
    if (ringMode) edcRenderRingPulse(pulse, age, ring, len);
    else edcRenderStripPulse(pulse, age, len);
  }

  const uint8_t bassGlow = edcScale8Video(low, std::max<uint8_t>(40, SEGMENT.intensity / 2));
  if (bassGlow > 10) {
    const uint8_t glow = bassGlow / (ringMode ? (1 + ring / 2) : 1);
    const uint16_t center = len / 2;
    const uint16_t glowWidth = std::max<uint16_t>(1, len / 7);
    for (uint16_t i = 0; i < len; i += 1) {
      const uint16_t dist = i > center ? i - center : center - i;
      if (ringMode || dist <= glowWidth) {
        const uint8_t falloff = ringMode ? glow : glow - (dist * glow / glowWidth);
        SEGMENT.addPixelColor(i, CHSV(kickHue, 210, falloff));
      }
    }
  }

  if (sparkle > 0 && high > 36) {
    const uint8_t count = std::min<uint8_t>(5, 1 + sparkle / 7 + high / 96);
    for (uint8_t i = 0; i < count; i += 1) {
      SEGMENT.addPixelColor(random16(len), CHSV(uint8_t(accentHue + 50 + random8(28)), 35, high));
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
