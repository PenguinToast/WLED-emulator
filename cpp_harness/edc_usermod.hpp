#pragma once

#include "wled_effect_harness.hpp"

#define USERMOD_ID_EDC_DANCE 900

extern const char _data_FX_MODE_EDC_CUSTOM[] PROGMEM;
extern uint8_t edcDebugPrimaryPulse;
extern uint8_t edcDebugSnarePulse;
extern uint8_t edcDebugHatPulse;
extern uint8_t edcDebugKickStrength;
extern uint16_t edcDebugKickInterval;
extern uint8_t edcDebugTempoConfidence;

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

void mode_edc_custom(void);

class EdcDanceUsermod {
 public:
  EdcDanceUsermodConfig config;

  uint16_t getId() const { return USERMOD_ID_EDC_DANCE; }
  void setup() {
    if (effectId == 255) effectId = strip.addEffect(255, &mode_edc_custom, _data_FX_MODE_EDC_CUSTOM);
  }
  uint8_t getEffectId() const { return effectId == 255 ? FX_MODE_EDC_CUSTOM : effectId; }
  void applyConfig(const EdcDanceUsermodConfig& next) { config = next; }

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

extern EdcDanceUsermod edcDanceUsermod;

EdcDanceUsermodConfig edcDefaultUsermodConfig();
void edcApplyUsermodConfig(const EdcDanceUsermodConfig& config);
