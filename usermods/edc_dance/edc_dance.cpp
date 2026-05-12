#include "wled.h"

#include <algorithm>

#define USERMOD_ID_EDC_DANCE 900

static void mode_edc_custom(void);

static const char _data_FX_MODE_EDC_CUSTOM[] PROGMEM = "EDC Custom@Speed,Beat Focus,Tightness,Impact,Accent Mix;!,!,!;!;1vf;sx=192,ix=150,c1=190,c2=190,c3=18,pal=4,m12=2,si=0";

enum class EdcDancePreset : uint8_t {
  Auto = 0,
  FourOnFloor = 1,
  BassMusic = 2,
  Trance = 3,
};

struct EdcDanceUsermodConfig {
  bool enabled = true;
  bool autoAdapt = true;
  uint8_t preset = uint8_t(EdcDancePreset::Auto);
  uint16_t segmentDelayMs = 22;
  uint8_t outwardFade = 8;
  uint8_t rumbleAmount = 42;
  uint8_t accentAmount = 128;
  uint16_t primaryMinGapMs = 118;
};

class EdcDanceUsermod : public Usermod {
 public:
  EdcDanceUsermodConfig config;

  void setup() override {
    if (effectId == 255) effectId = strip.addEffect(255, &mode_edc_custom, _data_FX_MODE_EDC_CUSTOM);
  }

  void loop() override {}

  uint16_t getId() override { return USERMOD_ID_EDC_DANCE; }

  void addToConfig(JsonObject& root) override {
    JsonObject top = root.createNestedObject(F("EDC Dance"));
    top[F("enabled")] = config.enabled;
    top[F("autoAdapt")] = config.autoAdapt;
    top[F("preset")] = config.preset;
    top[F("segmentDelayMs")] = config.segmentDelayMs;
    top[F("outwardFade")] = config.outwardFade;
    top[F("rumbleAmount")] = config.rumbleAmount;
    top[F("accentAmount")] = config.accentAmount;
    top[F("primaryMinGapMs")] = config.primaryMinGapMs;
  }

  bool readFromConfig(JsonObject& root) override {
    JsonObject top = root[F("EDC Dance")];
    bool configComplete = !top.isNull();
    configComplete &= getJsonValue(top[F("enabled")], config.enabled, true);
    configComplete &= getJsonValue(top[F("autoAdapt")], config.autoAdapt, true);
    configComplete &= getJsonValue(top[F("preset")], config.preset, uint8_t(EdcDancePreset::Auto));
    configComplete &= getJsonValue(top[F("segmentDelayMs")], config.segmentDelayMs, uint16_t(22));
    configComplete &= getJsonValue(top[F("outwardFade")], config.outwardFade, uint8_t(8));
    configComplete &= getJsonValue(top[F("rumbleAmount")], config.rumbleAmount, uint8_t(42));
    configComplete &= getJsonValue(top[F("accentAmount")], config.accentAmount, uint8_t(128));
    configComplete &= getJsonValue(top[F("primaryMinGapMs")], config.primaryMinGapMs, uint16_t(118));

    config.segmentDelayMs = std::max<uint16_t>(1, std::min<uint16_t>(120, config.segmentDelayMs));
    config.outwardFade = std::min<uint8_t>(32, config.outwardFade);
    config.rumbleAmount = std::min<uint8_t>(128, config.rumbleAmount);
    config.accentAmount = std::max<uint8_t>(16, config.accentAmount);
    config.primaryMinGapMs = std::max<uint16_t>(60, std::min<uint16_t>(300, config.primaryMinGapMs));
    return configComplete;
  }

  void appendConfigData(Print& uiScript) override {
    uiScript.print(F("addInfo('EDC Dance:segmentDelayMs',1,'Base ring-to-ring propagation delay.');"));
    uiScript.print(F("addInfo('EDC Dance:primaryMinGapMs',1,'Minimum spacing for the dominant kick pulse.');"));
  }

  uint8_t segmentIndex() const { return strip.getCurrSegmentId(); }
  uint8_t segmentCount() const { return std::max<uint8_t>(1, strip.getActiveSegmentsNum()); }
  bool isSegmentFixture() const { return segmentCount() > 1; }
  uint8_t segmentProgress255() const {
    const uint8_t count = segmentCount();
    if (count <= 1) return 0;
    return uint8_t((uint16_t(segmentIndex()) * 255U) / uint16_t(count - 1));
  }

  uint16_t propagationDelayMs() const {
    return std::max<uint16_t>(1, config.segmentDelayMs + (255 - SEGMENT.speed) / 10);
  }

  uint8_t outwardFadeFor(uint8_t pulseType) const {
    const uint16_t scale = pulseType == 0 ? config.outwardFade : config.outwardFade + 5;
    return std::min<uint8_t>(96, uint16_t(segmentIndex()) * scale);
  }

  uint8_t accentLevel(uint8_t value) const {
    return uint8_t(std::min<uint16_t>(255, (uint16_t(value) * std::max<uint8_t>(16, config.accentAmount)) / 128U));
  }

 private:
  uint8_t effectId = 255;
};

static EdcDanceUsermod edcDanceUsermod;
REGISTER_USERMOD(edcDanceUsermod);
static uint8_t edcDebugPrimaryPulse = 0;
static uint8_t edcDebugSnarePulse = 0;
static uint8_t edcDebugHatPulse = 0;
static uint8_t edcDebugKickStrength = 0;
static uint16_t edcDebugKickInterval = 0;
static uint8_t edcDebugTempoConfidence = 0;

static constexpr uint8_t EDC_AUTO_ADAPT_LEVEL = 178;
static constexpr uint16_t EDC_MIN_PRIMARY_INTERVAL_MS = 320;
static constexpr uint16_t EDC_MIN_STABLE_CANDIDATE_MS = 360;
static constexpr uint16_t EDC_MAX_PRIMARY_INTERVAL_MS = 940;

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
  uint8_t smoothVolume;
  uint8_t smoothKickEnergy;
  uint8_t avgKickEnergy;
  uint8_t peakKickEnergy;
  uint8_t smoothSnareEnergy;
  uint8_t smoothHatEnergy;
  uint8_t avgKickFlux;
  uint8_t avgSnareFlux;
  uint8_t avgHatFlux;
  uint8_t avgVolumeFlux;
  uint8_t peakKickFlux;
  uint8_t peakSnareFlux;
  uint8_t peakHatFlux;
  uint8_t peakVolumeFlux;
  uint8_t lastKickStrength;
  uint16_t kickInterval;
  uint16_t candidateInterval;
  uint8_t tempoConfidence;
  uint8_t candidateVotes;
  uint32_t lastKick;
  uint32_t lastSnare;
  uint32_t lastHat;
  uint8_t beatStep;
  uint8_t cursor;
  EdcPulse pulses[10];
};

struct EdcControls {
  uint8_t beatFocus;
  uint8_t impact;
  uint8_t accentMix;
  uint8_t adaptLevel;
  uint8_t accentSelectivity;
};

struct EdcAudioFrame {
  uint16_t len;
  uint8_t low;
  uint8_t mid;
  uint8_t high;
  uint8_t volume;
  uint8_t kickEnergy;
  uint8_t snareEnergy;
  uint8_t hatEnergy;
  uint8_t lowRange;
  bool samplePeak;
};

struct EdcOnsetFrame {
  uint8_t kickFlux;
  uint8_t volumeFlux;
  uint8_t snareFlux;
  uint8_t hatFlux;
  uint8_t kickFluxFloor;
  uint8_t volumeFluxFloor;
  uint8_t kickEnergyFloor;
  uint8_t snareFluxFloor;
  uint8_t hatFluxFloor;
  bool strongKickFlux;
  bool broadbandKick;
};

struct EdcKickDecision {
  bool kick;
  bool normalKick;
  bool phaseCorrectionKick;
  uint32_t sinceKick;
};

static uint8_t edcMaxBin(const uint8_t* fftResult, uint8_t first, uint8_t last) {
  uint8_t result = 0;
  if (!fftResult) return result;
  for (uint8_t index = first; index <= last && index < 16; index += 1) {
    if (fftResult[index] > result) result = fftResult[index];
  }
  return result;
}

static uint8_t edcHash8(uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352dU;
  value ^= value >> 15;
  value *= 0x846ca68bU;
  value ^= value >> 16;
  return uint8_t(value & 0xffU);
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

static uint16_t edcFoldTempoGap(uint32_t gap, uint16_t interval) {
  if (interval > 0 && gap > uint32_t(interval) + interval / 2U) {
    const uint8_t multiple = uint8_t(std::min<uint32_t>(3, (gap + interval / 2U) / interval));
    if (multiple > 1) gap = (gap + multiple / 2U) / multiple;
  }
  return uint16_t(std::min<uint32_t>(EDC_MAX_PRIMARY_INTERVAL_MS, std::max<uint32_t>(EDC_MIN_PRIMARY_INTERVAL_MS, gap)));
}

static bool edcTempoClose(uint16_t a, uint16_t b) {
  return edcAbsDiff32(a, b) <= std::max<uint16_t>(48, b / 8U);
}

static bool edcTempoCoherent(uint16_t gap, uint16_t interval) {
  if (uint32_t(gap) * 100U < uint32_t(interval) * 88U) return false;
  return edcAbsDiff32(gap, interval) <= std::max<uint16_t>(70, interval / 4U);
}

static void edcResetTempoCandidate(EdcPulseState* state) {
  state->candidateInterval = 0;
  state->candidateVotes = 0;
}

static bool edcTrackTempoCandidate(EdcPulseState* state, uint16_t gap, uint32_t diff) {
  if (gap < EDC_MIN_STABLE_CANDIDATE_MS) {
    edcResetTempoCandidate(state);
    return false;
  }

  if (state->candidateInterval && edcTempoClose(gap, state->candidateInterval)) {
    state->candidateInterval = uint16_t((uint32_t(state->candidateInterval) * 3U + gap) / 4U);
    if (state->candidateVotes < 8) state->candidateVotes += 1;
  } else {
    state->candidateInterval = gap;
    state->candidateVotes = 1;
  }

  const bool shorterThanCurrent = state->candidateInterval + state->candidateInterval / 4U < state->kickInterval;
  const uint8_t requiredVotes = shorterThanCurrent && state->tempoConfidence > 64 ? 5 : 3;
  return state->candidateVotes >= requiredVotes && diff > std::max<uint32_t>(82, state->kickInterval / 5U);
}

static uint8_t edcTempoWindowMultiple(const EdcPulseState* state, uint32_t sinceKick, uint16_t cooldown) {
  if (state->lastKick == 0 || state->tempoConfidence <= 48 || state->kickInterval == 0 || sinceKick <= cooldown) return 0;
  const uint16_t interval = state->kickInterval;
  const uint8_t maxMultiple = uint8_t(std::min<uint32_t>(4, sinceKick / interval + 1U));
  for (uint8_t multiple = 1; multiple <= maxMultiple; multiple += 1) {
    const uint32_t target = uint32_t(interval) * multiple;
    const uint32_t early = multiple == 1 ? 76U : 92U;
    const uint32_t late = multiple == 1 ? 116U : 132U;
    if (sinceKick + early >= target && sinceKick <= target + late) return multiple;
  }
  return 0;
}

static void edcTrackKickTempo(EdcPulseState* state, uint32_t now) {
  if (state->lastKick == 0) {
    state->lastKick = now;
    state->tempoConfidence = std::max<uint8_t>(state->tempoConfidence, 24);
    return;
  }

  const uint32_t rawGap = now - state->lastKick;
  const uint16_t gap = edcFoldTempoGap(rawGap, state->kickInterval);
  if (rawGap >= EDC_MIN_PRIMARY_INTERVAL_MS && rawGap <= EDC_MAX_PRIMARY_INTERVAL_MS * 3U) {
    const uint32_t diff = edcAbsDiff32(gap, state->kickInterval);
    const bool coherent = edcTempoCoherent(gap, state->kickInterval);
    if (coherent) {
      edcResetTempoCandidate(state);
      const uint8_t weight = state->tempoConfidence < 64 ? 3 : 7;
      state->kickInterval = uint16_t((uint32_t(state->kickInterval) * weight + gap) / (weight + 1U));
      state->tempoConfidence = uint8_t(std::min<uint16_t>(255, uint16_t(state->tempoConfidence) + 34));
    } else if (edcTrackTempoCandidate(state, gap, diff)) {
      state->kickInterval = uint16_t((uint32_t(state->kickInterval) * 3U + state->candidateInterval) / 4U);
      state->tempoConfidence = uint8_t(std::min<uint16_t>(160, uint16_t(state->tempoConfidence) + 10U));
      edcResetTempoCandidate(state);
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
  return std::min<uint16_t>(520, std::max<uint16_t>(EDC_MIN_PRIMARY_INTERVAL_MS, learned));
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
      const bool crackFill = pulse.shape > 188 && edcHash8(uint32_t(i) * 37U + pulse.born / 13U + segment * 29U) < uint8_t(30 + pulse.shape / 5);
      if (!bodyArc && !clapFill && !crackFill) continue;
    } else if (pulse.type == 2) {
      const uint8_t density = uint8_t(std::min<uint16_t>(220, 26U + pulse.strength / 2U + pulse.shape / 3U));
      if (edcHash8(uint32_t(i) * 73U + pulse.born / 17U + uint32_t(segment) * 41U) > density) continue;
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
      if (edcHash8(uint32_t(i) * 83U + pulse.born / 19U) > density) continue;
    }
    const uint8_t edge = 255 - (delta * 255U) / width;
    const uint8_t value = edcScale8Video(edcScale8Video(pulse.strength, envelope), edge);
    if (value > 4) SEGMENT.addPixelColor(i, edcSlotColor(slot, pulse.colorIndex + i * 5, value));
  }
}

static EdcControls edcReadControls() {
  const uint8_t accentMix = SEGMENT.custom3;
  return EdcControls{
    SEGMENT.intensity,
    SEGMENT.custom2,
    accentMix,
    edcDanceUsermod.config.autoAdapt ? EDC_AUTO_ADAPT_LEVEL : uint8_t(96),
    uint8_t(31 - std::min<uint8_t>(31, accentMix)),
  };
}

static EdcAudioFrame edcReadAudioFrame(uint16_t len) {
  um_data_t* umData = nullptr;
  uint8_t emptyFft[16] = {0};
  const uint8_t* fftResult = emptyFft;
  float volumeSmth = 0.0f;
  bool samplePeak = false;
  if (UsermodManager::getUMData(&umData, USERMOD_ID_AUDIOREACTIVE) && umData && umData->u_size >= 4) {
    if (umData->u_data[0]) volumeSmth = *(float*)umData->u_data[0];
    if (umData->u_data[2]) fftResult = (uint8_t*)umData->u_data[2];
    if (umData->u_data[3]) samplePeak = *(uint8_t*)umData->u_data[3] != 0;
  }

  const uint8_t low = edcMaxBin(fftResult, 0, 3);
  const uint8_t mid = edcMaxBin(fftResult, 4, 10);
  const uint8_t high = edcMaxBin(fftResult, 11, 15);
  const uint8_t volume = uint8_t(std::min<float>(255.0f, std::max<float>(0.0f, volumeSmth)));
  const uint8_t sub = edcMaxBin(fftResult, 0, 1);
  const uint8_t punch = edcMaxBin(fftResult, 2, 5);
  const uint8_t kickEnergy = std::max<uint8_t>(edcScale8Video(sub, 238), edcScale8Video(edcBlend8(sub, punch, 86), 232));
  const uint8_t snareEnergy = std::max<uint8_t>(mid, edcScale8Video(edcBlend8(edcMaxBin(fftResult, 5, 8), edcMaxBin(fftResult, 8, 11), 96), 224));
  return EdcAudioFrame{len, low, mid, high, volume, kickEnergy, snareEnergy, high, 0, samplePeak};
}

static void edcInitializeState(EdcPulseState* state, const EdcAudioFrame& audio) {
  state->avgLow = audio.low;
  state->avgMid = audio.mid;
  state->avgHigh = audio.high;
  state->peakLow = audio.low;
  state->smoothVolume = audio.volume;
  state->smoothKickEnergy = audio.kickEnergy;
  state->avgKickEnergy = audio.kickEnergy;
  state->peakKickEnergy = audio.kickEnergy;
  state->smoothSnareEnergy = audio.snareEnergy;
  state->smoothHatEnergy = audio.hatEnergy;
  state->avgKickFlux = 4;
  state->avgSnareFlux = 4;
  state->avgHatFlux = 3;
  state->avgVolumeFlux = 4;
  state->peakKickFlux = 12;
  state->peakSnareFlux = 10;
  state->peakHatFlux = 8;
  state->peakVolumeFlux = 10;
  state->lastKickStrength = 0;
  state->kickInterval = 480;
  state->candidateInterval = 0;
  state->tempoConfidence = 0;
  state->candidateVotes = 0;
}

static void edcUpdatePeaks(EdcPulseState* state, EdcAudioFrame* audio, const EdcControls& controls) {
  state->peakLow = edcDecayPeak(state->peakLow, audio->low, 2 + (255 - controls.adaptLevel) / 96);
  state->peakKickEnergy = edcDecayPeak(state->peakKickEnergy, audio->kickEnergy, 2 + (255 - controls.adaptLevel) / 96);
  audio->lowRange = state->peakLow > state->avgLow ? uint8_t(state->peakLow - state->avgLow) : 0;
}

static EdcOnsetFrame edcAnalyzeOnsets(EdcPulseState* state, const EdcAudioFrame& audio, const EdcControls& controls) {
  EdcOnsetFrame onset{};
  onset.kickFlux = edcPositiveDelta(audio.kickEnergy, state->smoothKickEnergy);
  onset.volumeFlux = edcPositiveDelta(audio.volume, state->smoothVolume);
  onset.snareFlux = edcPositiveDelta(audio.snareEnergy, state->smoothSnareEnergy);
  onset.hatFlux = edcPositiveDelta(audio.hatEnergy, state->smoothHatEnergy);
  state->peakKickFlux = edcDecayPeak(state->peakKickFlux, onset.kickFlux, 1 + (255 - controls.adaptLevel) / 128);
  state->peakVolumeFlux = edcDecayPeak(state->peakVolumeFlux, onset.volumeFlux, 1 + (255 - controls.adaptLevel) / 128);
  state->peakSnareFlux = edcDecayPeak(state->peakSnareFlux, onset.snareFlux, 2);
  state->peakHatFlux = edcDecayPeak(state->peakHatFlux, onset.hatFlux, 3);

  onset.kickFluxFloor = edcAdaptiveFluxFloor(state->avgKickFlux, state->peakKickFlux, uint8_t(7 + controls.beatFocus / 40), controls.adaptLevel, controls.beatFocus);
  onset.volumeFluxFloor = edcAdaptiveFluxFloor(state->avgVolumeFlux, state->peakVolumeFlux, uint8_t(6 + controls.beatFocus / 48), controls.adaptLevel / 2, controls.beatFocus / 2);
  onset.kickEnergyFloor = edcEnergyFloor(state->avgKickEnergy, state->peakKickEnergy, uint8_t(5 + controls.beatFocus / 64), controls.adaptLevel, controls.beatFocus);
  onset.snareFluxFloor = edcAdaptiveFluxFloor(state->avgSnareFlux, state->peakSnareFlux, uint8_t(8 + controls.accentSelectivity / 18 + controls.beatFocus / 64), controls.adaptLevel / 2, controls.beatFocus / 2);
  onset.hatFluxFloor = edcAdaptiveFluxFloor(state->avgHatFlux, state->peakHatFlux, uint8_t(7 + controls.accentSelectivity / 16 + controls.beatFocus / 72), controls.adaptLevel / 3, controls.beatFocus / 3);
  onset.strongKickFlux = onset.kickFlux >= onset.kickFluxFloor && audio.kickEnergy >= onset.kickEnergyFloor;
  onset.broadbandKick = onset.volumeFlux >= onset.volumeFluxFloor;
  return onset;
}

static EdcKickDecision edcDecideKick(EdcPulseState* state, const EdcAudioFrame& audio, const EdcOnsetFrame& onset, const EdcControls& controls) {
  const uint16_t learnedCooldown = edcPrimaryKickCooldown(state->kickInterval, state->tempoConfidence, controls.beatFocus);
  const uint16_t minPrimaryGap = std::max<uint16_t>(150, edcDanceUsermod.config.primaryMinGapMs);
  const uint16_t kickCooldown = std::max<uint16_t>(minPrimaryGap, learnedCooldown);
  const uint32_t sinceKick = strip.now - state->lastKick;
  const uint8_t tempoMultiple = edcTempoWindowMultiple(state, sinceKick, kickCooldown);
  const bool nearTempo = tempoMultiple == 1;
  const bool missedTempo = tempoMultiple > 1;
  const bool hintedKickFlux = (audio.samplePeak || nearTempo)
    && uint16_t(onset.kickFlux) * 5U >= uint16_t(onset.kickFluxFloor) * 3U
    && audio.kickEnergy > uint16_t(state->avgKickEnergy) + 5U;
  const bool tempoKickFlux = nearTempo
    && onset.kickFlux >= std::max<uint8_t>(2, onset.kickFluxFloor / 2)
    && audio.kickEnergy > uint16_t(state->avgKickEnergy) + 3U;
  const bool denseDrop = audio.mid > uint16_t(state->avgMid) + 10U || audio.high > uint16_t(state->avgHigh) + 10U
    || (audio.mid > 86 && audio.high > 58);
  const bool missedLowEvidence = audio.samplePeak
    || onset.kickFlux >= std::max<uint8_t>(2, onset.kickFluxFloor / 2)
    || audio.kickEnergy > uint16_t(state->avgKickEnergy) + 8U;
  const bool tempoRescueKick = (nearTempo || missedTempo)
    && state->tempoConfidence > 112
    && state->beatStep >= 4
    && audio.kickEnergy > 24
    && audio.low > 18
    && (nearTempo ? (audio.samplePeak || onset.kickFlux > 0 || denseDrop) : missedLowEvidence)
    && audio.kickEnergy + 10U >= state->avgKickEnergy;
  const bool kickDominant = uint16_t(audio.kickEnergy) * (214 - controls.beatFocus / 5 + controls.adaptLevel / 10) > uint16_t(audio.mid) * 128
    && uint16_t(audio.kickEnergy) * (198 - controls.beatFocus / 6 + controls.adaptLevel / 12) > uint16_t(audio.high) * 128;
  const bool tempoDominant = nearTempo && audio.kickEnergy > uint16_t(state->avgKickEnergy) + 4U;
  const bool primaryBeatWindow = edcPrimaryBeatWindow(state, sinceKick, nearTempo || missedTempo, controls.beatFocus);
  const bool impactKickFlux = (onset.strongKickFlux && (onset.broadbandKick || nearTempo || missedTempo)) || hintedKickFlux || tempoKickFlux;
  const bool normalKick = impactKickFlux && (kickDominant || tempoDominant) && primaryBeatWindow && sinceKick > kickCooldown;
  const uint8_t provisionalStrength = edcHitStrength(audio.kickEnergy, onset.kickFlux, onset.kickEnergyFloor, 104, controls.impact);
  const bool phaseCorrectionKick = state->tempoConfidence > 88
    && sinceKick > 170
    && sinceKick < kickCooldown
    && onset.broadbandKick
    && onset.strongKickFlux
    && kickDominant
    && uint16_t(provisionalStrength) > uint16_t(state->lastKickStrength) + 24U;
  const bool kick = normalKick || (tempoRescueKick && sinceKick > kickCooldown) || phaseCorrectionKick;
  return EdcKickDecision{kick, normalKick, phaseCorrectionKick, sinceKick};
}

static void edcHandleKick(EdcPulseState* state, const EdcAudioFrame& audio, const EdcOnsetFrame& onset, const EdcControls& controls, const EdcKickDecision& decision) {
  if (!decision.kick) {
    if (state->lastKick != 0 && decision.sinceKick > uint32_t(state->kickInterval) * 2U && state->tempoConfidence > 0) state->tempoConfidence -= 1;
    return;
  }

  if (decision.normalKick) edcTrackKickTempo(state, strip.now);
  else if (decision.phaseCorrectionKick) edcTrackTempoRescueKick(state, strip.now);
  else edcTrackTempoRescueKick(state, strip.now);
  state->beatStep += 1;
  const uint8_t strengthFlux = decision.normalKick ? onset.kickFlux : std::max<uint8_t>(onset.kickFlux, std::max<uint8_t>(3, onset.kickFluxFloor / 3));
  const uint8_t rescueFloor = uint8_t(std::min<uint16_t>(255, uint16_t(state->avgKickEnergy) + 4U));
  const uint8_t strengthFloor = decision.normalKick ? onset.kickEnergyFloor : std::min<uint8_t>(onset.kickEnergyFloor, rescueFloor);
  const uint8_t kickStrength = edcHitStrength(audio.kickEnergy, strengthFlux, strengthFloor, 104, controls.impact);
  state->lastKickStrength = kickStrength;
  if (edcDanceUsermod.segmentIndex() == 0) {
    edcDebugPrimaryPulse = 1;
    edcDebugKickStrength = kickStrength;
  }
  edcSpawnPulse(state, 0, kickStrength, uint8_t(state->beatStep * 29));
}

static void edcHandleAccents(EdcPulseState* state, const EdcAudioFrame& audio, const EdcOnsetFrame& onset, const EdcControls& controls, const EdcKickDecision& decision) {
  const bool snare = onset.snareFlux >= onset.snareFluxFloor
    && audio.snareEnergy > uint16_t(state->avgMid) + 7U
    && audio.snareEnergy > uint16_t(audio.low) * 5U / 8U
    && strip.now - state->lastSnare > 120;
  const bool hat = onset.hatFlux >= onset.hatFluxFloor
    && audio.hatEnergy > uint16_t(state->avgHigh) + 6U
    && audio.hatEnergy > uint16_t(audio.mid) * 2U / 3U
    && audio.hatEnergy > uint16_t(audio.low) / 2U
    && strip.now - state->lastHat > 92;

  if (snare && !decision.kick) {
    state->lastSnare = strip.now;
    const uint8_t snareBalance = edcSoundBalance(audio.low / 2, audio.snareEnergy, audio.high);
    const uint8_t snareShape = edcAccentShape(audio.snareEnergy, onset.snareFlux, state->avgMid, snareBalance);
    if (edcDanceUsermod.segmentIndex() == 0) edcDebugSnarePulse = 1;
    edcSpawnPulse(state, 1, edcAccentLevel(edcHitStrength(audio.snareEnergy, onset.snareFlux, state->avgMid, 82, controls.impact), controls.accentMix), uint8_t(96 + state->beatStep * 17 + snareShape / 7), snareShape);
  }
  if (hat) {
    state->lastHat = strip.now;
    const uint8_t hatBalance = edcSoundBalance(0, audio.mid / 2, audio.hatEnergy);
    const uint8_t hatShape = edcAccentShape(audio.hatEnergy, onset.hatFlux, state->avgHigh, hatBalance);
    if (edcDanceUsermod.segmentIndex() == 0) edcDebugHatPulse = 1;
    edcSpawnPulse(state, 2, edcAccentLevel(edcHitStrength(audio.hatEnergy, onset.hatFlux, state->avgHigh, 56, controls.impact), controls.accentMix), uint8_t(180 + state->beatStep * 13 + hatShape / 5), hatShape);
  }
}

static void edcAdaptState(EdcPulseState* state, const EdcAudioFrame& audio, const EdcOnsetFrame& onset, const EdcKickDecision& decision) {
  state->smoothKickEnergy = edcIir(state->smoothKickEnergy, audio.kickEnergy, audio.kickEnergy > state->smoothKickEnergy ? 3 : 3);
  state->smoothVolume = edcIir(state->smoothVolume, audio.volume, audio.volume > state->smoothVolume ? 3 : 3);
  state->smoothSnareEnergy = edcIir(state->smoothSnareEnergy, audio.snareEnergy, audio.snareEnergy > state->smoothSnareEnergy ? 2 : 3);
  state->smoothHatEnergy = edcIir(state->smoothHatEnergy, audio.hatEnergy, audio.hatEnergy > state->smoothHatEnergy ? 2 : 3);
  state->avgLow = edcIir(state->avgLow, audio.low, 5);
  state->avgMid = edcIir(state->avgMid, audio.mid, 5);
  state->avgHigh = edcIir(state->avgHigh, audio.high, 5);
  state->avgKickEnergy = edcIir(state->avgKickEnergy, decision.kick ? edcCappedAdaptValue(state->avgKickEnergy, audio.kickEnergy, 8) : audio.kickEnergy, 5);
  state->avgKickFlux = edcIir(state->avgKickFlux, decision.kick ? edcCappedAdaptValue(state->avgKickFlux, onset.kickFlux, 3) : onset.kickFlux, 5);
  state->avgVolumeFlux = edcIir(state->avgVolumeFlux, decision.kick ? edcCappedAdaptValue(state->avgVolumeFlux, onset.volumeFlux, 3) : onset.volumeFlux, 5);
  state->avgSnareFlux = edcIir(state->avgSnareFlux, onset.snareFlux, 5);
  state->avgHatFlux = edcIir(state->avgHatFlux, onset.hatFlux, 5);

  if (edcDanceUsermod.segmentIndex() == 0) {
    edcDebugKickInterval = state->kickInterval;
    edcDebugTempoConfidence = state->tempoConfidence;
  }
}

static void edcRenderActivePulses(const EdcPulseState* state, uint16_t len) {
  const bool segmentMode = edcDanceUsermod.isSegmentFixture();
  for (uint8_t index = 0; index < 10; index += 1) {
    const EdcPulse& pulse = state->pulses[index];
    if (pulse.strength == 0 || strip.now < pulse.born) continue;
    const uint32_t age = strip.now - pulse.born;
    if (segmentMode) edcRenderSegmentPulse(pulse, age, len);
    else edcRenderStripPulse(pulse, age, len);
  }
}

static void edcRenderRumble(const EdcPulseState* state, const EdcAudioFrame& audio, const EdcKickDecision& decision) {
  const uint8_t sustainedLow = audio.low > state->avgLow ? uint8_t(audio.low - state->avgLow) : 0;
  const uint8_t bassGlow = decision.kick ? 0 : edcScale8Video(std::max<uint8_t>(sustainedLow, audio.lowRange / 3), edcDanceUsermod.config.rumbleAmount);
  if (bassGlow <= 8) return;

  const bool segmentMode = edcDanceUsermod.isSegmentFixture();
  const uint8_t progress = edcDanceUsermod.segmentProgress255();
  const uint8_t segmentDrop = segmentMode ? edcScale8Video(progress, 120) : 0;
  const uint8_t glow = bassGlow > segmentDrop ? uint8_t(bassGlow - segmentDrop) : 0;
  const uint16_t center = audio.len / 2;
  const uint16_t glowWidth = std::max<uint16_t>(1, audio.len / 7);
  for (uint16_t i = 0; i < audio.len; i += 1) {
    const uint16_t dist = i > center ? i - center : center - i;
    if (glow > 5 && (segmentMode || dist <= glowWidth)) {
      const uint8_t falloff = segmentMode ? glow : glow - (dist * glow / glowWidth);
      const uint32_t rumbleColor = color_blend(edcSlotColor(0, uint8_t(42 + progress / 2), falloff), edcSlotColor(2, uint8_t(170 + progress / 3), falloff), 112);
      SEGMENT.addPixelColor(i, rumbleColor);
    }
  }
}

static void mode_edc_custom(void) {
  if (SEGLEN == 0) return;
  if (!edcDanceUsermod.config.enabled) {
    SEGMENT.fadeToBlackBy(96);
    return;
  }

  if (!SEGENV.allocateData(sizeof(EdcPulseState))) {
    SEGMENT.fill(SEGCOLOR(0));
    return;
  }
  EdcPulseState* state = reinterpret_cast<EdcPulseState*>(SEGENV.data);

  const EdcControls controls = edcReadControls();
  EdcAudioFrame audio = edcReadAudioFrame(SEGLEN);

  if (SEGENV.call == 0) edcInitializeState(state, audio);

  edcUpdatePeaks(state, &audio, controls);
  const EdcOnsetFrame onset = edcAnalyzeOnsets(state, audio, controls);
  const EdcKickDecision kick = edcDecideKick(state, audio, onset, controls);

  edcHandleKick(state, audio, onset, controls, kick);
  edcHandleAccents(state, audio, onset, controls, kick);
  edcAdaptState(state, audio, onset, kick);

  SEGMENT.fadeToBlackBy(uint8_t(58 + SEGMENT.custom1 / 8));
  edcRenderActivePulses(state, audio.len);
  edcRenderRumble(state, audio, kick);

  return;
}
