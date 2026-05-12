#include "edc_usermod.hpp"
#include "generated/upstream_fx_1d.hpp"

const char _data_FX_MODE_EDC_CUSTOM[] PROGMEM = "EDC Custom@Speed,Beat Focus,Tightness,Impact,Accent Mix;!,!,!;!;1vf;sx=192,ix=150,c1=190,c2=190,c3=18,pal=4,m12=2,si=0";
EdcDanceUsermod edcDanceUsermod;

static constexpr uint8_t EDC_AUTO_ADAPT_LEVEL = 178;

struct EdcPulse {
  uint32_t born;
  uint16_t tempoMs;
  uint8_t type;
  uint8_t strength;
  uint8_t colorIndex;
  uint8_t shape;
};

struct EdcPulseState {
  uint8_t avgLow;
  uint8_t avgMid;
  uint8_t avgHigh;
  uint8_t peakLow;
  uint8_t smoothKickEnergy;
  uint8_t avgKickEnergy;
  uint8_t peakKickEnergy;
  uint8_t smoothSnareEnergy;
  uint8_t smoothHatEnergy;
  uint8_t avgKickFlux;
  uint8_t avgSnareFlux;
  uint8_t avgHatFlux;
  uint8_t peakKickFlux;
  uint8_t peakSnareFlux;
  uint8_t peakHatFlux;
  uint16_t kickInterval;
  uint8_t tempoConfidence;
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

static uint8_t edcIir(uint8_t current, uint8_t value, uint8_t shift) {
  const uint16_t keep = (1U << shift) - 1U;
  return uint8_t((uint16_t(current) * keep + value) >> shift);
}

static uint8_t edcPositiveDelta(uint8_t value, uint8_t baseline) {
  return value > baseline ? uint8_t(value - baseline) : 0;
}

static uint8_t edcAdaptiveFluxFloor(uint8_t average, uint8_t peak, uint8_t base, uint8_t adapt, uint8_t focus) {
  const uint8_t range = peak > average ? uint8_t(peak - average) : 0;
  const uint8_t peakWeight = uint8_t(std::min<uint16_t>(210, 54 + adapt / 3 + focus / 8));
  return uint8_t(std::min<uint16_t>(240, uint16_t(average) + base + edcScale8Video(range, peakWeight)));
}

static uint8_t edcEnergyFloor(uint8_t average, uint8_t peak, uint8_t base, uint8_t adapt, uint8_t focus) {
  const uint8_t range = peak > average ? uint8_t(peak - average) : 0;
  const uint8_t weight = uint8_t(std::min<uint16_t>(210, 36 + adapt / 4 + focus / 16));
  return uint8_t(std::min<uint16_t>(240, uint16_t(average) + base + edcScale8Video(range, weight)));
}

static uint8_t edcHitStrength(uint8_t energy, uint8_t flux, uint8_t floor, uint8_t minimum, uint8_t impact) {
  const uint8_t above = energy > floor ? uint8_t(energy - floor) : 0;
  const uint16_t punch = std::min<uint16_t>(255, uint16_t(above) * 3U + uint16_t(flux) * 5U + energy / 4U);
  const uint8_t base = uint8_t(minimum + ((255U - minimum) * punch) / 255U);
  if (impact >= 190) return uint8_t(base + ((255U - base) * uint16_t(impact - 190)) / 65U);
  const uint8_t scale = uint8_t(82 + (uint16_t(impact) * 173U) / 190U);
  return edcScale8Video(base, scale);
}

static uint8_t edcCappedAdaptValue(uint8_t average, uint8_t value, uint8_t allowance) {
  if (value <= average) return value;
  return uint8_t(std::min<uint16_t>(value, uint16_t(average) + allowance));
}

static uint8_t edcAccentLevel(uint8_t value, uint8_t accentMix) {
  return edcDanceUsermod.accentLevel(edcScale8Video(value, uint8_t(56 + accentMix * 6U)));
}

static uint8_t edcSoundBalance(uint8_t low, uint8_t mid, uint8_t high) {
  const uint16_t total = uint16_t(low) + mid + high;
  if (total == 0) return 128;
  return uint8_t(std::min<uint16_t>(255, (uint16_t(high) * 255U + mid * 96U) / total));
}

static uint8_t edcAccentShape(uint8_t energy, uint8_t flux, uint8_t floor, uint8_t balance) {
  const uint8_t lift = energy > floor ? uint8_t(energy - floor) : 0;
  const uint16_t shape = uint16_t(balance) / 2U + uint16_t(flux) * 3U + uint16_t(lift) * 2U;
  return uint8_t(std::min<uint16_t>(255, shape));
}

static uint32_t edcAbsDiff32(uint32_t a, uint32_t b) {
  return a > b ? a - b : b - a;
}

static void edcTrackKickTempo(EdcPulseState* state, uint32_t now) {
  if (state->lastKick == 0) {
    state->lastKick = now;
    state->tempoConfidence = std::max<uint8_t>(state->tempoConfidence, 24);
    return;
  }

  const uint32_t gap = now - state->lastKick;
  if (gap >= 240 && gap <= 940) {
    const uint32_t diff = edcAbsDiff32(gap, state->kickInterval);
    const bool coherent = diff < std::max<uint32_t>(70, state->kickInterval / 4U);
    const uint8_t weight = coherent || state->tempoConfidence < 64 ? 3 : 7;
    state->kickInterval = uint16_t((uint32_t(state->kickInterval) * weight + gap) / (weight + 1U));
    if (coherent) {
      state->tempoConfidence = uint8_t(std::min<uint16_t>(255, uint16_t(state->tempoConfidence) + 34));
    } else if (state->tempoConfidence > 18) {
      state->tempoConfidence -= 18;
    } else {
      state->tempoConfidence = 0;
    }
  } else if (state->tempoConfidence > 28) {
    state->tempoConfidence -= 28;
  } else {
    state->tempoConfidence = 0;
  }
  state->lastKick = now;
}

static void edcTrackTempoRescueKick(EdcPulseState* state, uint32_t now) {
  state->lastKick = now;
  if (state->tempoConfidence > 20) state->tempoConfidence -= 2;
}

static uint16_t edcNormalizedTempoMs(uint16_t tempoMs) {
  uint16_t normalized = tempoMs ? tempoMs : 480;
  while (normalized < 320) normalized *= 2;
  while (normalized > 760) normalized /= 2;
  return std::min<uint16_t>(720, std::max<uint16_t>(320, normalized));
}

static uint8_t edcTempoPct(uint16_t tempoMs, uint8_t fastPct, uint8_t slowPct) {
  const uint16_t normalized = edcNormalizedTempoMs(tempoMs);
  if (normalized <= 480) {
    return uint8_t(fastPct + ((uint32_t(normalized - 320) * (100U - fastPct)) / 160U));
  }
  return uint8_t(100U + ((uint32_t(normalized - 480) * (slowPct - 100U)) / 240U));
}

static uint16_t edcPrimaryKickCooldown(uint16_t interval, uint8_t confidence, uint8_t focus) {
  uint8_t pct = 48;
  if (confidence > 112) pct = uint8_t(72 + std::min<uint8_t>(12, focus / 22));
  else if (confidence > 48) pct = uint8_t(60 + std::min<uint8_t>(9, focus / 32));
  const uint16_t learned = uint16_t((uint32_t(interval) * pct) / 100U);
  return std::min<uint16_t>(520, std::max<uint16_t>(220, learned));
}

static bool edcPrimaryBeatWindow(const EdcPulseState* state, uint32_t sinceKick, bool nearTempo, uint8_t focus) {
  const uint8_t lockThreshold = uint8_t(116 - std::min<uint8_t>(44, focus / 4));
  if (state->tempoConfidence <= lockThreshold || state->lastKick == 0) return true;
  if (nearTempo) return true;
  return sinceKick > uint32_t(state->kickInterval) + 116U;
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
  if (type == 0 && age < 24) return 255;
  const uint8_t decay = 255 - (age * 255U) / life;
  if (type == 0) return edcScale8Video(decay, decay);
  if (type == 1) return edcScale8Video(decay, uint8_t(160 + decay / 3));
  return edcScale8Video(decay, decay);
}

static uint8_t edcPulseEnvelopeFloor(uint8_t type) {
  if (type == 0) return 14;
  if (type == 1) return 9;
  return 8;
}

static void edcSpawnPulse(EdcPulseState* state, uint8_t type, uint8_t strength, uint8_t colorIndex, uint8_t shape = 0) {
  EdcPulse& pulse = state->pulses[state->cursor % 10];
  pulse.born = strip.now;
  pulse.tempoMs = state->kickInterval;
  pulse.type = type;
  pulse.strength = strength;
  pulse.colorIndex = colorIndex;
  pulse.shape = shape;
  state->cursor = (state->cursor + 1) % 10;
}

static uint16_t edcPulseLife(const EdcPulse& pulse) {
  const uint16_t speedTail = 255 - SEGMENT.speed;
  uint16_t base = 115;
  if (pulse.type == 0) {
    const uint16_t tight = 310 + speedTail / 3;
    const uint16_t loose = 620 + speedTail;
    base = tight + ((loose - tight) * uint16_t(255 - SEGMENT.custom1)) / 255;
    return uint16_t((uint32_t(base) * edcTempoPct(pulse.tempoMs, 78, 148)) / 100U);
  }
  if (pulse.type == 1) base = 210 + uint16_t(255 - SEGMENT.custom1) / 4;
  return uint16_t((uint32_t(base) * edcTempoPct(pulse.tempoMs, 86, 124)) / 100U);
}

static uint8_t edcPulseWidth(uint8_t type, uint16_t len) {
  uint8_t base = type == 0 ? 5 : (type == 1 ? 3 : 1);
  return std::max<uint8_t>(base, 1 + len / (type == 0 ? 16 : (type == 1 ? 28 : 48)));
}

static uint8_t edcPulseOutwardFalloff(const EdcPulse& pulse) {
  const uint16_t staticFade = edcDanceUsermod.outwardFadeFor(pulse.type);
  const uint8_t progress = edcDanceUsermod.segmentProgress255();
  const uint8_t weak = 255 - pulse.strength;
  const uint8_t impact = SEGMENT.custom2;
  const uint8_t impactFade = uint8_t((255 - impact) / (pulse.type == 0 ? 4 : 6));
  const uint8_t strengthFade = pulse.type == 0
    ? edcScale8Video(progress, uint8_t(18 + impactFade + weak / 2))
    : edcScale8Video(progress, uint8_t(14 + impactFade + weak / 3));
  return uint8_t(std::min<uint16_t>(224, staticFade + strengthFade));
}

static uint16_t edcPulseSegmentDelay(const EdcPulse& pulse) {
  const uint16_t base = edcDanceUsermod.propagationDelayMs();
  return std::max<uint16_t>(1, uint16_t((uint32_t(base) * edcTempoPct(pulse.tempoMs, 72, 138)) / 100U));
}

static uint16_t edcShockTrailQ8(uint8_t type) {
  if (type == 0) return uint16_t(300 + ((255U - SEGMENT.custom1) * 220U) / 255U);
  if (type == 1) return 260;
  return 180;
}

static uint8_t edcShockEnvelope(const EdcPulse& pulse, uint32_t age, uint16_t delay, uint8_t segment) {
  const uint32_t frontQ8 = (age * 256U) / delay;
  const uint32_t segmentQ8 = uint32_t(segment) * 256U;
  if (frontQ8 < segmentQ8) return 0;

  const uint32_t trailQ8 = edcShockTrailQ8(pulse.type);
  const uint32_t behindQ8 = frontQ8 - segmentQ8;
  if (behindQ8 > trailQ8) return 0;

  uint8_t envelope = uint8_t(255U - (behindQ8 * 255U) / trailQ8);
  if (pulse.type == 0) return edcScale8Video(envelope, uint8_t(std::min<uint16_t>(255, 176U + envelope / 3U)));
  if (pulse.type == 1) return edcScale8Video(envelope, uint8_t(148 + envelope / 4));
  return edcScale8Video(envelope, envelope);
}

static void edcRenderSegmentPulse(const EdcPulse& pulse, uint32_t age, uint16_t len) {
  const uint8_t segment = edcDanceUsermod.segmentIndex();
  const uint16_t delay = edcPulseSegmentDelay(pulse);
  const uint32_t maxAge = uint32_t(edcDanceUsermod.segmentCount() - 1U) * delay + (uint32_t(edcShockTrailQ8(pulse.type)) * delay) / 256U;
  if (age > maxAge) return;

  const uint8_t envelope = edcShockEnvelope(pulse, age, delay, segment);
  const uint8_t falloff = edcPulseOutwardFalloff(pulse);
  const uint8_t segmentEnvelope = envelope > falloff ? uint8_t(envelope - falloff) : 0;
  if (segmentEnvelope < edcPulseEnvelopeFloor(pulse.type)) return;
  const uint8_t brightness = edcScale8Video(pulse.strength, segmentEnvelope);
  if (brightness < 5) return;

  const uint8_t phase = uint8_t(strip.now / (pulse.type == 0 ? 12 : 6));
  const uint8_t slot = std::min<uint8_t>(2, pulse.type);
  for (uint16_t i = 0; i < len; i += 1) {
    if (pulse.type == 1) {
      const uint8_t angle = uint8_t((uint32_t(i) * 255U) / std::max<uint16_t>(1, len - 1));
      const uint8_t center = pulse.colorIndex + segment * 17U;
      const uint8_t mirror = center + 128U;
      const uint8_t distA = uint8_t(std::min<uint8_t>(uint8_t(angle - center), uint8_t(center - angle)));
      const uint8_t distB = uint8_t(std::min<uint8_t>(uint8_t(angle - mirror), uint8_t(mirror - angle)));
      const uint8_t arc = uint8_t(12 + pulse.strength / 16 + pulse.shape / 18);
      const bool bodyArc = distA < arc || distB < arc;
      const bool clapFill = pulse.shape > 118 && ((i + segment + pulse.colorIndex) % 3U) == 0;
      const bool crackFill = pulse.shape > 188 && hash8(uint32_t(i) * 37U + pulse.born / 13U + segment * 29U) < uint8_t(30 + pulse.shape / 5);
      if (!bodyArc && !clapFill && !crackFill) continue;
    } else if (pulse.type == 2) {
      const uint8_t density = uint8_t(std::min<uint16_t>(220, 26U + pulse.strength / 2U + pulse.shape / 3U));
      if (hash8(uint32_t(i) * 73U + pulse.born / 17U + uint32_t(segment) * 41U) > density) continue;
    }
    uint8_t shimmer = pulse.type == 0 ? 245 : sin8_t(uint8_t(i * (pulse.type == 1 ? 58 : 113) + phase + pulse.shape / 2));
    if (pulse.type == 1 && ((i + segment + pulse.colorIndex) & 0x03) == 0) shimmer = uint8_t(std::max<uint8_t>(shimmer, 204));
    if (pulse.type == 2) shimmer = uint8_t(std::max<uint8_t>(shimmer, uint8_t(150 + pulse.shape / 3)));
    uint8_t value = edcScale8Video(brightness, shimmer);
    if (pulse.type == 0) value = std::max<uint8_t>(value, uint8_t(brightness * 3 / 5));
    const uint8_t colorIndex = pulse.colorIndex + segment * (pulse.type == 0 ? 11 : 19) + i * (pulse.type == 2 ? 7 : 1);
    SEGMENT.addPixelColor(i, edcSlotColor(slot, colorIndex, value));
  }
}

static void edcRenderStripPulse(const EdcPulse& pulse, uint32_t age, uint16_t len) {
  const uint16_t life = edcPulseLife(pulse);
  if (age > life) return;

  const uint16_t half = std::max<uint16_t>(1, len / 2);
  const uint16_t radius = std::min<uint16_t>(half + edcPulseWidth(pulse.type, len), (age * (half + edcPulseWidth(pulse.type, len))) / life);
  const uint8_t width = edcPulseWidth(pulse.type, len);
  const uint8_t envelope = edcPulseEnvelope(pulse.type, age, life);
  if (envelope < edcPulseEnvelopeFloor(pulse.type)) return;
  const uint8_t slot = std::min<uint8_t>(2, pulse.type);

  for (uint16_t i = 0; i < len; i += 1) {
    const uint16_t dist = i > half ? i - half : half - i;
    const uint16_t delta = radius > dist ? radius - dist : dist - radius;
    if (delta > width) continue;
    if (pulse.type == 1) {
      const uint8_t skip = pulse.shape > 170 ? 3 : 5;
      if (((i + pulse.colorIndex) % skip) == 0 && pulse.strength < 190) continue;
    } else if (pulse.type == 2) {
      const uint8_t density = uint8_t(std::min<uint16_t>(220, 30U + pulse.strength / 2U + pulse.shape / 3U));
      if (hash8(uint32_t(i) * 83U + pulse.born / 19U) > density) continue;
    }
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
  const uint8_t sub = edcMaxBin(0, 1);
  const uint8_t punch = edcMaxBin(2, 5);
  const uint8_t kickEnergy = std::max<uint8_t>(edcScale8Video(sub, 238), edcScale8Video(edcBlend8(sub, punch, 86), 232));
  const uint8_t snareEnergy = std::max<uint8_t>(mid, edcScale8Video(edcBlend8(edcMaxBin(5, 8), edcMaxBin(8, 11), 96), 224));
  const uint8_t hatEnergy = high;
  const uint8_t beatFocus = SEGMENT.intensity;
  const uint8_t impact = SEGMENT.custom2;
  const uint8_t accentMix = SEGMENT.custom3;
  const uint8_t adaptLevel = edcDanceUsermod.config.autoAdapt ? EDC_AUTO_ADAPT_LEVEL : 96;
  const uint8_t accentSelectivity = 31 - std::min<uint8_t>(31, accentMix);

  if (SEGENV.call == 0) {
    state->avgLow = low;
    state->avgMid = mid;
    state->avgHigh = high;
    state->peakLow = low;
    state->smoothKickEnergy = kickEnergy;
    state->avgKickEnergy = kickEnergy;
    state->peakKickEnergy = kickEnergy;
    state->smoothSnareEnergy = snareEnergy;
    state->smoothHatEnergy = hatEnergy;
    state->avgKickFlux = 4;
    state->avgSnareFlux = 4;
    state->avgHatFlux = 3;
    state->peakKickFlux = 12;
    state->peakSnareFlux = 10;
    state->peakHatFlux = 8;
    state->kickInterval = 480;
    state->tempoConfidence = 0;
  }

  state->peakLow = edcDecayPeak(state->peakLow, low, 2 + (255 - adaptLevel) / 96);
  state->peakKickEnergy = edcDecayPeak(state->peakKickEnergy, kickEnergy, 2 + (255 - adaptLevel) / 96);
  const uint8_t lowRange = state->peakLow > state->avgLow ? uint8_t(state->peakLow - state->avgLow) : 0;

  const uint8_t kickFlux = edcPositiveDelta(kickEnergy, state->smoothKickEnergy);
  const uint8_t snareFlux = edcPositiveDelta(snareEnergy, state->smoothSnareEnergy);
  const uint8_t hatFlux = edcPositiveDelta(hatEnergy, state->smoothHatEnergy);
  state->peakKickFlux = edcDecayPeak(state->peakKickFlux, kickFlux, 1 + (255 - adaptLevel) / 128);
  state->peakSnareFlux = edcDecayPeak(state->peakSnareFlux, snareFlux, 2);
  state->peakHatFlux = edcDecayPeak(state->peakHatFlux, hatFlux, 3);

  const uint8_t kickFluxFloor = edcAdaptiveFluxFloor(state->avgKickFlux, state->peakKickFlux, uint8_t(7 + beatFocus / 40), adaptLevel, beatFocus);
  const uint8_t kickEnergyFloor = edcEnergyFloor(state->avgKickEnergy, state->peakKickEnergy, uint8_t(5 + beatFocus / 64), adaptLevel, beatFocus);
  const uint16_t learnedCooldown = edcPrimaryKickCooldown(state->kickInterval, state->tempoConfidence, beatFocus);
  const uint16_t minPrimaryGap = std::max<uint16_t>(150, edcDanceUsermod.config.primaryMinGapMs);
  const uint16_t kickCooldown = std::max<uint16_t>(minPrimaryGap, learnedCooldown);
  const uint32_t sinceKick = strip.now - state->lastKick;
  const bool nearTempo = state->lastKick != 0 && state->tempoConfidence > 48 && sinceKick > kickCooldown
    && sinceKick + 76U >= state->kickInterval && sinceKick <= uint32_t(state->kickInterval) + 116U;
  const bool strongKickFlux = kickFlux >= kickFluxFloor && kickEnergy >= kickEnergyFloor;
  const bool hintedKickFlux = (samplePeak || nearTempo)
    && uint16_t(kickFlux) * 5U >= uint16_t(kickFluxFloor) * 3U
    && kickEnergy > uint16_t(state->avgKickEnergy) + 5U;
  const bool tempoKickFlux = nearTempo
    && kickFlux >= std::max<uint8_t>(2, kickFluxFloor / 2)
    && kickEnergy > uint16_t(state->avgKickEnergy) + 3U;
  const bool denseDrop = mid > uint16_t(state->avgMid) + 10U || high > uint16_t(state->avgHigh) + 10U
    || (mid > 86 && high > 58);
  const bool tempoRescueKick = nearTempo
    && state->tempoConfidence > 112
    && state->beatStep >= 4
    && kickEnergy > 24
    && low > 18
    && (samplePeak || kickFlux > 0 || denseDrop)
    && kickEnergy + 10U >= state->avgKickEnergy;
  const bool kickDominant = uint16_t(kickEnergy) * (214 - beatFocus / 5 + adaptLevel / 10) > uint16_t(mid) * 128
    && uint16_t(kickEnergy) * (198 - beatFocus / 6 + adaptLevel / 12) > uint16_t(high) * 128;
  const bool tempoDominant = nearTempo && kickEnergy > uint16_t(state->avgKickEnergy) + 4U;
  const bool primaryBeatWindow = edcPrimaryBeatWindow(state, sinceKick, nearTempo, beatFocus);
  const bool normalKick = (strongKickFlux || hintedKickFlux || tempoKickFlux) && (kickDominant || tempoDominant) && primaryBeatWindow && sinceKick > kickCooldown;
  const bool kick = normalKick || (tempoRescueKick && sinceKick > kickCooldown);

  const uint8_t snareFluxFloor = edcAdaptiveFluxFloor(state->avgSnareFlux, state->peakSnareFlux, uint8_t(8 + accentSelectivity / 18 + beatFocus / 64), adaptLevel / 2, beatFocus / 2);
  const uint8_t hatFluxFloor = edcAdaptiveFluxFloor(state->avgHatFlux, state->peakHatFlux, uint8_t(7 + accentSelectivity / 16 + beatFocus / 72), adaptLevel / 3, beatFocus / 3);
  const bool snare = snareFlux >= snareFluxFloor
    && snareEnergy > uint16_t(state->avgMid) + 7U
    && snareEnergy > uint16_t(low) * 5U / 8U
    && strip.now - state->lastSnare > 120;
  const bool hat = hatFlux >= hatFluxFloor
    && hatEnergy > uint16_t(state->avgHigh) + 6U
    && hatEnergy > uint16_t(mid) * 2U / 3U
    && hatEnergy > uint16_t(low) / 2U
    && strip.now - state->lastHat > 92;

  if (kick) {
    if (normalKick) edcTrackKickTempo(state, strip.now);
    else edcTrackTempoRescueKick(state, strip.now);
    state->beatStep += 1;
    const uint8_t strengthFlux = normalKick ? kickFlux : std::max<uint8_t>(kickFlux, std::max<uint8_t>(3, kickFluxFloor / 3));
    const uint8_t rescueFloor = uint8_t(std::min<uint16_t>(255, uint16_t(state->avgKickEnergy) + 4U));
    const uint8_t strengthFloor = normalKick ? kickEnergyFloor : std::min<uint8_t>(kickEnergyFloor, rescueFloor);
    edcSpawnPulse(state, 0, edcHitStrength(kickEnergy, strengthFlux, strengthFloor, 104, impact), uint8_t(state->beatStep * 29));
  } else if (state->lastKick != 0 && sinceKick > uint32_t(state->kickInterval) * 2U && state->tempoConfidence > 0) {
    state->tempoConfidence -= 1;
  }
  if (snare && !kick) {
    state->lastSnare = strip.now;
    const uint8_t snareBalance = edcSoundBalance(low / 2, snareEnergy, high);
    const uint8_t snareShape = edcAccentShape(snareEnergy, snareFlux, state->avgMid, snareBalance);
    edcSpawnPulse(state, 1, edcAccentLevel(edcHitStrength(snareEnergy, snareFlux, state->avgMid, 82, impact), accentMix), uint8_t(96 + state->beatStep * 17 + snareShape / 7), snareShape);
  }
  if (hat) {
    state->lastHat = strip.now;
    const uint8_t hatBalance = edcSoundBalance(0, mid / 2, hatEnergy);
    const uint8_t hatShape = edcAccentShape(hatEnergy, hatFlux, state->avgHigh, hatBalance);
    edcSpawnPulse(state, 2, edcAccentLevel(edcHitStrength(hatEnergy, hatFlux, state->avgHigh, 56, impact), accentMix), uint8_t(180 + state->beatStep * 13 + hatShape / 5), hatShape);
  }

  state->smoothKickEnergy = edcIir(state->smoothKickEnergy, kickEnergy, kickEnergy > state->smoothKickEnergy ? 3 : 3);
  state->smoothSnareEnergy = edcIir(state->smoothSnareEnergy, snareEnergy, snareEnergy > state->smoothSnareEnergy ? 2 : 3);
  state->smoothHatEnergy = edcIir(state->smoothHatEnergy, hatEnergy, hatEnergy > state->smoothHatEnergy ? 2 : 3);
  state->avgLow = edcIir(state->avgLow, low, 5);
  state->avgMid = edcIir(state->avgMid, mid, 5);
  state->avgHigh = edcIir(state->avgHigh, high, 5);
  state->avgKickEnergy = edcIir(state->avgKickEnergy, kick ? edcCappedAdaptValue(state->avgKickEnergy, kickEnergy, 8) : kickEnergy, 5);
  state->avgKickFlux = edcIir(state->avgKickFlux, kick ? edcCappedAdaptValue(state->avgKickFlux, kickFlux, 3) : kickFlux, 5);
  state->avgSnareFlux = edcIir(state->avgSnareFlux, snareFlux, 5);
  state->avgHatFlux = edcIir(state->avgHatFlux, hatFlux, 5);

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
