#include "edc_usermod.hpp"
#include "generated/upstream_fx_1d.hpp"

const char _data_FX_MODE_EDC_CUSTOM[] PROGMEM = "EDC Custom@Speed,Beat Focus,Tightness,Bass Adapt,Accent Gate;!,!,!;!;1vf;sx=192,ix=150,c1=190,c2=178,c3=12,pal=4,m12=2,si=0";
EdcDanceUsermod edcDanceUsermod;

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
  uint8_t avgLow;
  uint8_t avgMid;
  uint8_t avgHigh;
  uint8_t peakLow;
  uint16_t kickInterval;
  uint32_t lastKick;
  uint32_t lastSnare;
  uint32_t lastHat;
  uint8_t beatStep;
  uint8_t cursor;
  EdcPulse pulses[10];
};

EdcDanceUsermodConfig edcDefaultUsermodConfig() {
  return EdcDanceUsermodConfig{};
}

void edcApplyUsermodConfig(const EdcDanceUsermodConfig& config) {
  edcDanceUsermod.applyConfig(config);
}

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

static uint8_t edcBlend8(uint8_t from, uint8_t to, uint8_t amount) {
  return from + ((int16_t(to) - int16_t(from)) * int16_t(amount)) / 255;
}

static uint8_t edcDecayPeak(uint8_t peak, uint8_t value, uint8_t decay) {
  if (value >= peak) return value;
  return peak > decay ? uint8_t(peak - decay) : value;
}

static uint8_t edcRiseThreshold(uint8_t previous, uint8_t rise, uint8_t floor) {
  return std::max<uint8_t>(floor, uint8_t(std::min<uint16_t>(255, uint16_t(previous) + rise)));
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

static void edcRenderSegmentPulse(const EdcPulse& pulse, uint32_t age, uint16_t len) {
  const uint8_t segment = edcDanceUsermod.segmentIndex();
  const uint16_t delay = edcDanceUsermod.propagationDelayMs();
  const uint32_t segmentDelay = uint32_t(segment) * delay;
  if (age < segmentDelay) return;
  const uint32_t delayedAge = age - segmentDelay;

  const uint16_t life = edcPulseLife(pulse.type);
  if (delayedAge > life) return;

  const uint8_t envelope = edcPulseEnvelope(pulse.type, delayedAge, life);
  const uint8_t falloff = edcDanceUsermod.outwardFadeFor(pulse.type);
  const uint8_t segmentEnvelope = envelope > falloff ? uint8_t(envelope - falloff) : 0;
  const uint8_t brightness = edcScale8Video(pulse.strength, segmentEnvelope);
  if (brightness < 5) return;

  const uint8_t phase = uint8_t(strip.now / (pulse.type == 0 ? 12 : 6));
  const uint8_t slot = std::min<uint8_t>(2, pulse.type);
  for (uint16_t i = 0; i < len; i += 1) {
    if (pulse.type == 2 && hash8(uint32_t(i) * 73U + pulse.born / 17U + uint32_t(segment) * 41U) > uint8_t(22 + pulse.strength / 8)) continue;
    uint8_t shimmer = pulse.type == 0 ? 245 : sin8_t(uint8_t(i * (pulse.type == 1 ? 58 : 113) + phase));
    if (pulse.type == 1 && ((i + segment + pulse.colorIndex) & 0x03) == 0) shimmer = 255;
    uint8_t value = edcScale8Video(brightness, shimmer);
    if (pulse.type == 0) value = std::max<uint8_t>(value, uint8_t(brightness * 3 / 5));
    const uint8_t colorIndex = pulse.colorIndex + segment * (pulse.type == 0 ? 11 : 19) + i * (pulse.type == 2 ? 7 : 1);
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
  if (!edcDanceUsermod.config.enabled) {
    SEGMENT.fadeToBlackBy(96);
    return FRAMETIME;
  }

  if (!SEGENV.allocateData(sizeof(EdcPulseState))) return mode_static();
  EdcPulseState* state = reinterpret_cast<EdcPulseState*>(SEGENV.data);

  const uint16_t len = SEGLEN;
  const uint8_t low = edcMaxBin(0, 3);
  const uint8_t mid = edcMaxBin(4, 10);
  const uint8_t high = edcMaxBin(11, 15);
  const uint8_t beatFocus = SEGMENT.intensity;
  const uint8_t bassAdapt = edcDanceUsermod.config.autoAdapt ? SEGMENT.custom2 : 96;
  const uint8_t accentGate = SEGMENT.custom3;
  const uint8_t kickLevel = std::max<uint8_t>(low, clamp8(volumeSmth));

  if (SEGENV.call == 0) {
    state->avgLow = low;
    state->avgMid = mid;
    state->avgHigh = high;
    state->peakLow = low;
    state->kickInterval = 480;
  }

  state->peakLow = edcDecayPeak(state->peakLow, low, 2 + (255 - bassAdapt) / 96);
  const uint8_t lowRange = state->peakLow > state->avgLow ? uint8_t(state->peakLow - state->avgLow) : 0;
  const uint8_t fixedKickFloor = uint8_t(54 + beatFocus / 8);
  const uint8_t adaptiveKickFloor = uint8_t(std::min<uint16_t>(240, uint16_t(state->avgLow) + std::max<uint8_t>(10, edcScale8Video(lowRange, uint8_t(58 + bassAdapt / 2 + beatFocus / 10)))));
  const uint8_t kickFloor = edcBlend8(fixedKickFloor, adaptiveKickFloor, bassAdapt);
  const uint8_t kickRise = uint8_t(std::max<int16_t>(12, 22 + beatFocus / 18 + (255 - bassAdapt) / 22));
  const uint16_t learnedCooldown = std::min<uint16_t>(182, std::max<uint16_t>(86, state->kickInterval / 3));
  const uint16_t kickCooldown = std::max<uint16_t>(edcDanceUsermod.config.primaryMinGapMs, edcBlend8(118, uint8_t(learnedCooldown), bassAdapt));

  const bool lowTransient = low > edcRiseThreshold(state->lastLow, samplePeak ? uint8_t(kickRise * 2 / 3) : kickRise, kickFloor);
  const bool kickDominant = uint16_t(low) * (220 - beatFocus / 4 + bassAdapt / 8) > uint16_t(mid) * 128
    && uint16_t(low) * (204 - beatFocus / 5 + bassAdapt / 10) > uint16_t(high) * 128;
  const bool kick = lowTransient && kickDominant && kickLevel > kickFloor && strip.now - state->lastKick > kickCooldown;

  const uint8_t accentRise = uint8_t(24 + accentGate * 2 + beatFocus / 20);
  const uint8_t snareFloor = uint8_t(std::min<uint16_t>(220, uint16_t(state->avgMid) + 22 + accentGate * 3 + beatFocus / 16));
  const uint8_t hatFloor = uint8_t(std::min<uint16_t>(230, uint16_t(state->avgHigh) + 24 + accentGate * 4 + beatFocus / 16));
  const bool snare = mid > edcRiseThreshold(state->lastMid, accentRise, snareFloor)
    && mid > low * 5 / 8
    && strip.now - state->lastSnare > 120;
  const bool hat = high > edcRiseThreshold(state->lastHigh, uint8_t(accentRise + 8), hatFloor)
    && high > mid * 3 / 4
    && high > low / 2
    && strip.now - state->lastHat > 92;

  if (kick) {
    const uint32_t gap = state->lastKick == 0 ? state->kickInterval : strip.now - state->lastKick;
    if (gap > 180 && gap < 980) state->kickInterval = uint16_t((uint32_t(state->kickInterval) * 3U + gap) / 4U);
    state->lastKick = strip.now;
    state->beatStep += 1;
    const uint8_t hitAboveFloor = kickLevel > kickFloor ? uint8_t(kickLevel - kickFloor) : 0;
    const uint8_t adaptedStrength = std::max<uint8_t>(148, std::min<uint8_t>(255, uint16_t(kickLevel) + hitAboveFloor));
    edcSpawnPulse(state, 0, adaptedStrength, uint8_t(state->beatStep * 29));
  }
  if (snare && !kick) {
    state->lastSnare = strip.now;
    const uint8_t snareAboveFloor = mid > snareFloor ? uint8_t(mid - snareFloor) : 0;
    edcSpawnPulse(state, 1, edcDanceUsermod.accentLevel(std::max<uint8_t>(86, std::min<uint8_t>(205, uint16_t(mid) + snareAboveFloor / 2))), uint8_t(96 + state->beatStep * 17));
  }
  if (hat) {
    state->lastHat = strip.now;
    const uint8_t hatAboveFloor = high > hatFloor ? uint8_t(high - hatFloor) : 0;
    edcSpawnPulse(state, 2, edcDanceUsermod.accentLevel(std::max<uint8_t>(58, std::min<uint8_t>(190, uint16_t(high) + hatAboveFloor))), uint8_t(180 + state->beatStep * 13));
  }

  state->lastLow = (state->lastLow * 5 + low) / 6;
  state->lastMid = (state->lastMid * 5 + mid) / 6;
  state->lastHigh = (state->lastHigh * 5 + high) / 6;
  state->avgLow = (state->avgLow * 31 + low) / 32;
  state->avgMid = (state->avgMid * 23 + mid) / 24;
  state->avgHigh = (state->avgHigh * 19 + high) / 20;

  SEGMENT.fadeToBlackBy(uint8_t(58 + SEGMENT.custom1 / 8));

  const bool segmentMode = edcDanceUsermod.isSegmentFixture();
  for (uint8_t index = 0; index < 10; index += 1) {
    const EdcPulse& pulse = state->pulses[index];
    if (pulse.strength == 0 || strip.now < pulse.born) continue;
    const uint32_t age = strip.now - pulse.born;
    if (segmentMode) edcRenderSegmentPulse(pulse, age, len);
    else edcRenderStripPulse(pulse, age, len);
  }

  const uint8_t sustainedLow = low > state->avgLow ? uint8_t(low - state->avgLow) : 0;
  const uint8_t bassGlow = kick ? 0 : edcScale8Video(std::max<uint8_t>(sustainedLow, lowRange / 3), edcDanceUsermod.config.rumbleAmount);
  if (bassGlow > 8) {
    const uint8_t progress = edcDanceUsermod.segmentProgress255();
    const uint8_t segmentDrop = segmentMode ? edcScale8Video(progress, 120) : 0;
    const uint8_t glow = bassGlow > segmentDrop ? uint8_t(bassGlow - segmentDrop) : 0;
    const uint16_t center = len / 2;
    const uint16_t glowWidth = std::max<uint16_t>(1, len / 7);
    for (uint16_t i = 0; i < len; i += 1) {
      const uint16_t dist = i > center ? i - center : center - i;
      if (glow > 5 && (segmentMode || dist <= glowWidth)) {
        const uint8_t falloff = segmentMode ? glow : glow - (dist * glow / glowWidth);
        const uint32_t rumbleColor = color_blend(edcSlotColor(0, uint8_t(42 + progress / 2), falloff), edcSlotColor(2, uint8_t(170 + progress / 3), falloff), 112);
        SEGMENT.addPixelColor(i, rumbleColor);
      }
    }
  }

  return FRAMETIME;
}
