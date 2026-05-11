#include "wled_effect_harness.hpp"
#include "generated/upstream_fx_1d.hpp"

// Paste this function body into WLED's FX.cpp (or a usermod that can register a
// mode function) and register it with addEffect(...). The host harness supplies
// the same SEGMENT/SEGENV/SEGLEN/SEGCOLOR/strip/audio symbols for local tests.
struct EdcPulse {
  uint32_t born;
  uint8_t type;
  uint8_t strength;
  uint8_t colorIndex;
};

struct EdcPulseState {
  uint8_t lastLow;
  uint8_t lastMid;
  uint8_t lastHigh;
  uint32_t lastKick;
  uint32_t lastSnare;
  uint32_t lastHat;
  uint8_t beatStep;
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

static bool edcIsBlack(uint32_t color) {
  return R(color) == 0 && G(color) == 0 && B(color) == 0 && W(color) == 0;
}

static uint32_t edcFallbackColor(uint8_t slot) {
  if (slot == 0) return RGBW32(255, 112, 24, 0);
  if (slot == 1) return RGBW32(0, 180, 255, 0);
  return RGBW32(245, 245, 255, 0);
}

static uint32_t edcSlotColor(uint8_t slot, uint8_t paletteIndex, uint8_t brightness) {
  const bool slotIsBlack = edcIsBlack(SEGCOLOR(slot));
  const uint32_t slotColor = slot == 0 && slotIsBlack ? edcFallbackColor(slot) : SEGCOLOR(slot);
  const uint32_t fadedSlot = color_fade(slotColor, brightness, true);
  if (SEGMENT.palette == 0) return fadedSlot;
  const uint32_t paletteColor = SEGMENT.color_from_palette(paletteIndex, false, true, slot, brightness);
  if (slotIsBlack && slot > 0) return paletteColor;
  return color_blend(fadedSlot, paletteColor, slot == 0 ? 74 : 116);
}

static uint8_t edcPulseEnvelope(uint8_t type, uint32_t age, uint16_t life) {
  if (age >= life) return 0;
  if (type == 0 && age < 38) return 255;
  const uint8_t decay = 255 - (age * 255U) / life;
  if (type == 0) return edcScale8Video(decay, decay);
  if (type == 1) return edcScale8Video(decay, uint8_t(160 + decay / 3));
  return edcScale8Video(decay, decay);
}

static void edcSpawnPulse(EdcPulseState* state, uint8_t type, uint8_t strength, uint8_t colorIndex) {
  EdcPulse& pulse = state->pulses[state->cursor % 10];
  pulse.born = strip.now;
  pulse.type = type;
  pulse.strength = strength;
  pulse.colorIndex = colorIndex;
  state->cursor = (state->cursor + 1) % 10;
}

static uint16_t edcPulseLife(uint8_t type) {
  const uint16_t speedTail = 255 - SEGMENT.speed;
  if (type == 0) {
    const uint16_t tight = 310 + speedTail / 3;
    const uint16_t loose = 620 + speedTail;
    return tight + ((loose - tight) * uint16_t(255 - SEGMENT.custom1)) / 255;
  }
  if (type == 1) return 210 + uint16_t(255 - SEGMENT.custom1) / 4;
  return 115;
}

static uint8_t edcPulseWidth(uint8_t type, uint16_t len) {
  uint8_t base = type == 0 ? 5 : (type == 1 ? 3 : 1);
  return std::max<uint8_t>(base, 1 + len / (type == 0 ? 16 : (type == 1 ? 28 : 48)));
}

static void edcRenderRingPulse(const EdcPulse& pulse, uint32_t age, uint8_t ring, uint16_t len) {
  const uint16_t ringDelay = 22 + (255 - SEGMENT.speed) / 10;
  const uint32_t delayedAge = ring > 0 ? age - std::min<uint32_t>(age, ring * ringDelay) : age;
  if (age < ring * ringDelay) return;

  const uint16_t life = edcPulseLife(pulse.type);
  if (delayedAge > life) return;

  const uint8_t envelope = edcPulseEnvelope(pulse.type, delayedAge, life);
  const uint8_t ringFalloff = std::min<uint8_t>(78, ring * (pulse.type == 0 ? 8 : 13));
  const uint8_t ringEnvelope = envelope > ringFalloff ? uint8_t(envelope - ringFalloff) : 0;
  const uint8_t brightness = edcScale8Video(pulse.strength, ringEnvelope);
  if (brightness < 5) return;

  const uint8_t phase = uint8_t(strip.now / (pulse.type == 0 ? 12 : 6));
  const uint8_t slot = std::min<uint8_t>(2, pulse.type);
  for (uint16_t i = 0; i < len; i += 1) {
    if (pulse.type == 2 && hash8(uint32_t(i) * 73U + pulse.born / 17U + uint32_t(ring) * 41U) > uint8_t(10 + SEGMENT.custom3 * 4)) continue;
    uint8_t shimmer = pulse.type == 0 ? 245 : sin8_t(uint8_t(i * (pulse.type == 1 ? 58 : 113) + phase));
    if (pulse.type == 1 && ((i + ring + pulse.colorIndex) & 0x03) == 0) shimmer = 255;
    uint8_t value = edcScale8Video(brightness, shimmer);
    if (pulse.type == 0) value = std::max<uint8_t>(value, uint8_t(brightness * 3 / 5));
    const uint8_t colorIndex = pulse.colorIndex + ring * (pulse.type == 0 ? 11 : 19) + i * (pulse.type == 2 ? 7 : 1);
    SEGMENT.addPixelColor(i, edcSlotColor(slot, colorIndex, value));
  }
}

static void edcRenderStripPulse(const EdcPulse& pulse, uint32_t age, uint16_t len) {
  const uint16_t life = edcPulseLife(pulse.type);
  if (age > life) return;

  const uint16_t half = std::max<uint16_t>(1, len / 2);
  const uint16_t radius = std::min<uint16_t>(half + edcPulseWidth(pulse.type, len), (age * (half + edcPulseWidth(pulse.type, len))) / life);
  const uint8_t width = edcPulseWidth(pulse.type, len);
  const uint8_t envelope = edcPulseEnvelope(pulse.type, age, life);
  const uint8_t slot = std::min<uint8_t>(2, pulse.type);

  for (uint16_t i = 0; i < len; i += 1) {
    const uint16_t dist = i > half ? i - half : half - i;
    const uint16_t delta = radius > dist ? radius - dist : dist - radius;
    if (delta > width) continue;
    const uint8_t edge = 255 - (delta * 255U) / width;
    const uint8_t value = edcScale8Video(edcScale8Video(pulse.strength, envelope), edge);
    if (value > 4) SEGMENT.addPixelColor(i, edcSlotColor(slot, pulse.colorIndex + i * 5, value));
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
  const uint8_t sparkle = SEGMENT.custom3;

  const bool lowTransient = low > edcRiseThreshold(state->lastLow, samplePeak ? 22 : 30, samplePeak ? 52 : 62);
  const bool kickDominant = low > mid * 2 / 3 && low > high * 3 / 4;
  const bool kick = lowTransient && kickDominant && kickLevel > 54 && strip.now - state->lastKick > 118;
  const bool snare = mid > edcRiseThreshold(state->lastMid, 36, 74)
    && mid > low * 5 / 8
    && strip.now - state->lastSnare > 120;
  const bool hat = sparkle > 0
    && high > edcRiseThreshold(state->lastHigh, 44, 82)
    && high > mid * 3 / 4
    && high > low / 2
    && strip.now - state->lastHat > 92;

  if (kick) {
    state->lastKick = strip.now;
    state->beatStep += 1;
    edcSpawnPulse(state, 0, std::max<uint8_t>(160, edcScale8Video(kickLevel, sensitivity)), uint8_t(state->beatStep * 29));
  }
  if (snare && !kick) {
    state->lastSnare = strip.now;
    edcSpawnPulse(state, 1, std::max<uint8_t>(92, edcScale8Video(mid, sensitivity)), uint8_t(96 + state->beatStep * 17));
  }
  if (hat) {
    state->lastHat = strip.now;
    edcSpawnPulse(state, 2, std::max<uint8_t>(64, edcScale8Video(high, uint8_t(116 + sparkle * 4))), uint8_t(180 + state->beatStep * 13));
  }

  state->lastLow = (state->lastLow * 5 + low) / 6;
  state->lastMid = (state->lastMid * 5 + mid) / 6;
  state->lastHigh = (state->lastHigh * 5 + high) / 6;

  SEGMENT.fadeToBlackBy(uint8_t(58 + SEGMENT.custom1 / 8));

  const uint8_t ring = edcRingIndex();
  const bool ringMode = strip.getActiveSegmentsNum() > 1;
  for (uint8_t index = 0; index < 10; index += 1) {
    const EdcPulse& pulse = state->pulses[index];
    if (pulse.strength == 0 || strip.now < pulse.born) continue;
    const uint32_t age = strip.now - pulse.born;
    if (ringMode) edcRenderRingPulse(pulse, age, ring, len);
    else edcRenderStripPulse(pulse, age, len);
  }

  const uint8_t rumbleScale = uint8_t(18 + SEGMENT.custom2 / 3);
  const uint8_t bassGlow = kick ? 0 : edcScale8Video(low, rumbleScale);
  if (bassGlow > 8) {
    const uint8_t ringDrop = ringMode ? std::min<uint8_t>(120, ring * 24) : 0;
    const uint8_t glow = bassGlow > ringDrop ? uint8_t(bassGlow - ringDrop) : 0;
    const uint16_t center = len / 2;
    const uint16_t glowWidth = std::max<uint16_t>(1, len / 7);
    for (uint16_t i = 0; i < len; i += 1) {
      const uint16_t dist = i > center ? i - center : center - i;
      if (glow > 5 && (ringMode || dist <= glowWidth)) {
        const uint8_t falloff = ringMode ? glow : glow - (dist * glow / glowWidth);
        const uint32_t rumbleColor = color_blend(edcSlotColor(0, uint8_t(42 + ring * 11), falloff), edcSlotColor(2, uint8_t(170 + ring * 9), falloff), 112);
        SEGMENT.addPixelColor(i, rumbleColor);
      }
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
