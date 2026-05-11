#include "edc_usermod.hpp"

#include <iostream>

namespace {
uint32_t readColor() {
  int r = 0;
  int g = 0;
  int b = 0;
  std::cin >> r >> g >> b;
  return RGBW32(clamp8(r), clamp8(g), clamp8(b), 0);
}

void writeHexByte(uint8_t value) {
  static constexpr char digits[] = "0123456789abcdef";
  std::cout << digits[value >> 4] << digits[value & 0x0f];
}

uint8_t applyOutputBrightness(uint8_t value, int brightness) {
  return clamp8((uint16_t(value) * uint16_t(std::max(0, std::min(255, brightness))) + 127U) / 255U);
}

void clearRange(std::vector<CRGB>& leds, int start, int stop) {
  const int from = std::max(0, std::min<int>(start, leds.size()));
  const int to = std::max(from, std::min<int>(stop, leds.size()));
  for (int index = from; index < to; index += 1) leds[index] = CRGB::Black;
}
}

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  std::vector<CRGB> leds(133);
  EffectContext ctx{leds};
  edcDanceUsermod.setup();
  int stateBrightness = 255;
  int segmentCount = 0;
  int beat = 0;
  int binCount = 0;

  while (std::cin >> ctx.time
                  >> ctx.frame
                  >> stateBrightness
                  >> segmentCount
                  >> ctx.audio.volume
                  >> ctx.audio.bass
                  >> ctx.audio.mid
                  >> ctx.audio.treble
                  >> beat
                  >> ctx.audio.bpm
                  >> ctx.audio.majorPeak
                  >> ctx.audio.magnitude
                  >> binCount) {
    ctx.audio.beat = beat != 0;
    ctx.audio.bins.fill(0.0f);
    for (int index = 0; index < binCount; index += 1) {
      float value = 0.0f;
      std::cin >> value;
      if (index < int(ctx.audio.bins.size())) ctx.audio.bins[index] = std::max(0.0f, std::min(1.0f, value));
    }
    int edcEnabled = 1;
    int edcPreset = 0;
    int edcAutoAdapt = 1;
    int edcSegmentDelayMs = 22;
    int edcOutwardFade = 8;
    int edcRumbleAmount = 42;
    int edcAccentAmount = 128;
    int edcPrimaryMinGapMs = 118;
    std::cin >> edcEnabled >> edcPreset >> edcAutoAdapt >> edcSegmentDelayMs
             >> edcOutwardFade >> edcRumbleAmount >> edcAccentAmount >> edcPrimaryMinGapMs;
    EdcDanceUsermodConfig edcConfig = edcDefaultUsermodConfig();
    edcConfig.enabled = edcEnabled != 0;
    edcConfig.preset = clamp8(edcPreset);
    edcConfig.autoAdapt = edcAutoAdapt != 0;
    edcConfig.segmentDelayMs = std::max(1, std::min(120, edcSegmentDelayMs));
    edcConfig.outwardFade = clamp8(std::max(0, std::min(32, edcOutwardFade)));
    edcConfig.rumbleAmount = clamp8(std::max(0, std::min(128, edcRumbleAmount)));
    edcConfig.accentAmount = clamp8(std::max(16, std::min(255, edcAccentAmount)));
    edcConfig.primaryMinGapMs = std::max(60, std::min(300, edcPrimaryMinGapMs));
    edcApplyUsermodConfig(edcConfig);

    for (int index = 0; index < segmentCount; index += 1) {
      int start = 0;
      int id = index;
      int stop = 0;
      int brightness = 255;
      int mode = 9;
      int speed = 128;
      int intensity = 128;
      int custom1 = 128;
      int custom2 = 128;
      int custom3 = 16;
      int check1 = 0;
      int check2 = 0;
      int check3 = 0;
      int soundSim = 0;
      int palette = 0;
      int on = 1;
      std::cin >> id >> start >> stop >> brightness >> mode >> speed >> intensity
               >> custom1 >> custom2 >> custom3 >> check1 >> check2 >> check3
               >> soundSim >> palette >> on;

      ctx.segment.id = clamp8(id);
      ctx.segment.start = std::max(0, std::min<int>(start, leds.size()));
      ctx.segment.stop = std::max<int>(ctx.segment.start, std::min<int>(stop, leds.size()));
      ctx.segment.brightness = on ? clamp8(brightness) : 0;
      ctx.segment.mode = clamp8(mode);
      ctx.segment.speed = clamp8(speed);
      ctx.segment.intensity = clamp8(intensity);
      ctx.segment.custom1 = clamp8(custom1);
      ctx.segment.custom2 = clamp8(custom2);
      ctx.segment.custom3 = clamp8(std::max(0, std::min(31, custom3)));
      ctx.segment.check1 = check1 != 0;
      ctx.segment.check2 = check2 != 0;
      ctx.segment.check3 = check3 != 0;
      ctx.segment.soundSim = clamp8(soundSim);
      ctx.segment.palette = clamp8(palette);
      ctx.segment.colors[0] = readColor();
      ctx.segment.colors[1] = readColor();
      ctx.segment.colors[2] = readColor();

      if (on && ctx.segment.start < ctx.segment.stop) render(ctx);
      else clearRange(leds, start, stop);
    }

    std::cout << "F ";
    for (const CRGB& led : leds) {
      writeHexByte(applyOutputBrightness(led.r, stateBrightness));
      writeHexByte(applyOutputBrightness(led.g, stateBrightness));
      writeHexByte(applyOutputBrightness(led.b, stateBrightness));
    }
    std::cout << '\n' << std::flush;
  }
}
