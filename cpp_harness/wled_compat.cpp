#include "wled_effect_harness.hpp"

HostStrip strip;

namespace {
const std::array<std::array<uint32_t, 5>, 7> hostPaletteStops = {{
  {RGBW32(255,160,80,0), RGBW32(20,120,255,0), RGBW32(255,40,120,0), RGBW32(255,160,80,0), RGBW32(20,120,255,0)},
  {RGBW32(25,120,110,0), RGBW32(84,210,164,0), RGBW32(242,193,78,0), RGBW32(229,88,88,0), RGBW32(115,95,220,0)},
  {RGBW32(8,8,8,0), RGBW32(124,20,12,0), RGBW32(229,74,26,0), RGBW32(255,178,66,0), RGBW32(255,245,170,0)},
  {RGBW32(8,20,46,0), RGBW32(18,92,128,0), RGBW32(37,169,190,0), RGBW32(126,224,203,0), RGBW32(236,250,228,0)},
  {RGBW32(255,85,156,0), RGBW32(255,199,95,0), RGBW32(109,226,167,0), RGBW32(70,170,255,0), RGBW32(180,111,255,0)},
  {RGBW32(255,0,68,0), RGBW32(255,191,0,0), RGBW32(32,255,92,0), RGBW32(0,196,255,0), RGBW32(122,64,255,0)},
  {RGBW32(12,48,24,0), RGBW32(24,116,48,0), RGBW32(88,168,74,0), RGBW32(210,224,130,0), RGBW32(12,48,24,0)}
}};

CRGBPalette16 paletteFromStops(const std::array<uint32_t, 5>& stops) {
  return CRGBPalette16{stops[0], stops[1], stops[2], stops[3], stops[4]};
}

}

CRGBPalette16 currentSegmentPalette() {
  if (SEGMENT.palette == 0) {
    return CRGBPalette16{SEGMENT.colors[0], SEGMENT.colors[1], SEGMENT.colors[2], SEGMENT.colors[0]};
  }
  return paletteFromStops(hostPaletteStops[SEGMENT.palette % hostPaletteStops.size()]);
}

uint32_t millis() {
  return strip.now;
}

uint32_t micros() {
  return strip.now * 1000U;
}

void HostStrip::selectSegment(uint8_t id) {
  if (id >= _segments.size()) _segments.resize(id + 1);
  currentSegment = id;
  _virtualSegmentLength = _segments[currentSegment].virtualLength();
}

uint16_t HostStrip::getLengthTotal() const {
  return leds ? leds->size() : 0;
}

void HostStrip::setPixelColor(unsigned i, uint32_t color) {
  if (!leds || i >= leds->size()) return;
  (*leds)[i] = CRGB(color);
}

uint32_t HostStrip::getPixelColor(unsigned i) const {
  if (!leds || i >= leds->size()) return BLACK;
  return toRgbw((*leds)[i]);
}

void HostStrip::fill(uint32_t color) {
  if (!leds) return;
  for (unsigned i = 0; i < leds->size(); i += 1) setPixelColor(i, color);
}

uint8_t HostStrip::addEffect(uint8_t id, mode_ptr modeFn, const char* modeData) {
  if (!modeFn || !modeData) return 255;
  const uint8_t actualId = id == 255 ? FX_MODE_EDC_CUSTOM : id;
  if (actualId == 255) return 255;
  for (const EffectRegistration& registration : registeredEffects) {
    if (registration.id == actualId) return 255;
  }
  registeredEffects.push_back({actualId, modeFn, modeData});
  return actualId;
}

void HostSegment::setPixelColor(int n, uint32_t color) {
  if (n >= 0) n &= 0xffff;
  if (n < 0 || n >= int(length())) return;
  strip.setPixelColor(start + uint16_t(n), color_fade(color, opacity));
}

uint32_t HostSegment::getPixelColor(int n) const {
  if (n >= 0) n &= 0xffff;
  if (n < 0 || n >= int(length())) return BLACK;
  return strip.getPixelColor(start + uint16_t(n));
}

void HostSegment::fill(uint32_t color) {
  for (uint16_t i = 0; i < length(); i += 1) setPixelColor(i, color);
}

void HostSegment::fade_out(uint8_t rate) {
  rate = (256 - rate) >> 1;
  const uint16_t mappedRate = 256 / (uint16_t(rate) + 1);
  const uint32_t target = colors[1];

  for (uint16_t i = 0; i < length(); i += 1) {
    uint32_t color = getPixelColor(i);
    if (color == target) continue;

    for (uint8_t shift = 0; shift <= 24; shift += 8) {
      const int16_t current = (color >> shift) & 0xff;
      const int16_t desired = (target >> shift) & 0xff;
      int16_t delta = ((desired - current) * int16_t(mappedRate)) >> 8;
      if (delta == 0) delta = desired > current ? 1 : -1;
      const uint8_t next = uint8_t(std::clamp<int16_t>(current + delta, 0, 255));
      color = (color & ~(uint32_t(0xff) << shift)) | (uint32_t(next) << shift);
    }

    setPixelColor(i, color);
  }
}

void HostSegment::fadeToBlackBy(uint8_t fadeBy) {
  const uint8_t keep = 255 - fadeBy;
  for (uint16_t i = 0; i < length(); i += 1) setPixelColor(i, color_fade(getPixelColor(i), keep, true));
}

void HostSegment::blur(uint8_t amount, bool) {
  const uint16_t len = length();
  if (len < 2 || amount == 0) return;
  std::vector<uint32_t> copy(len);
  for (uint16_t i = 0; i < len; i += 1) copy[i] = getPixelColor(i);
  for (uint16_t i = 0; i < len; i += 1) {
    const uint32_t left = copy[i == 0 ? 0 : i - 1];
    const uint32_t center = copy[i];
    const uint32_t right = copy[i + 1 < len ? i + 1 : i];
    uint32_t mixed = color_blend(center, color_blend(left, right, 128), amount);
    setPixelColor(i, mixed);
  }
}

uint32_t HostSegment::color_wheel(uint8_t pos) const {
  if (palette) return color_from_palette(pos, false, true, 0);
  const uint8_t p = 255 - pos;
  if (p < 85) return RGBW32(255 - p * 3, 0, p * 3, 0);
  if (p < 170) return RGBW32(0, (p - 85) * 3, 255 - (p - 85) * 3, 0);
  return RGBW32((p - 170) * 3, 255 - (p - 170) * 3, 0, 0);
}

uint32_t HostSegment::color_from_palette(uint16_t index, bool mapping, bool wrap, uint8_t mcol, uint8_t pbri) const {
  if (palette == 0 && mcol < NUM_COLORS) return color_fade(currentColor(mcol), pbri, true);
  uint16_t pos = mapping && length() > 1 ? (index * 255U) / (length() - 1U) : index;
  if (!wrap) pos = std::min<uint16_t>(pos, 255);
  return toRgbw(ColorFromPalette(currentSegmentPalette(), uint8_t(pos), pbri, LINEARBLEND));
}

void prepareWledFrame(EffectContext& ctx) {
  strip.bind(&ctx.leds);
  strip.selectSegment(ctx.segment.id);
  HostSegment& segment = SEGMENT;
  const bool modeChanged = segment.mode != ctx.segment.mode;
  const bool boundsChanged = segment.start != ctx.segment.start || segment.stop != ctx.segment.stop;
  if (modeChanged || boundsChanged) {
    segment.step = 0;
    segment.call = 0;
    segment.aux0 = 0;
    segment.aux1 = 0;
    segment.deallocateData();
  }
  segment.start = ctx.segment.start;
  segment.stop = std::min<uint16_t>(ctx.segment.stop, ctx.leds.size());
  segment.opacity = ctx.segment.brightness;
  segment.mode = ctx.segment.mode;
  segment.speed = ctx.segment.speed;
  segment.intensity = ctx.segment.intensity;
  segment.custom1 = ctx.segment.custom1;
  segment.custom2 = ctx.segment.custom2;
  segment.custom3 = ctx.segment.custom3;
  segment.check1 = ctx.segment.check1;
  segment.check2 = ctx.segment.check2;
  segment.check3 = ctx.segment.check3;
  segment.soundSim = ctx.segment.soundSim;
  segment.palette = ctx.segment.palette;
  std::memcpy(segment.colors, ctx.segment.colors, sizeof(segment.colors));
  if (modeChanged || boundsChanged) segment.fill(BLACK);
  strip._virtualSegmentLength = segment.virtualLength();
  strip.now = static_cast<uint32_t>(ctx.time * 1000.0f);
  strip.brightness = ctx.segment.brightness;
  prepareAudioReactiveFrame(ctx.audio);
}

void finishWledFrame(EffectContext&) {
  SEGMENT.call += 1;
}
