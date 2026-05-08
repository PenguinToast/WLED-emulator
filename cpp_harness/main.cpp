#include "wled_effect_harness.hpp"

#include <iostream>

namespace {
uint32_t readColor() {
  int r = 0;
  int g = 0;
  int b = 0;
  std::cin >> r >> g >> b;
  return RGBW32(clamp8(r), clamp8(g), clamp8(b), 0);
}
}

int main() {
  std::vector<CRGB> leds(133);
  EffectContext ctx{leds};
  int stateBrightness = 255;
  int segmentCount = 0;
  int beat = 0;

  while (std::cin >> ctx.time
                  >> ctx.frame
                  >> stateBrightness
                  >> segmentCount
                  >> ctx.audio.volume
                  >> ctx.audio.bass
                  >> ctx.audio.mid
                  >> ctx.audio.treble
                  >> beat
                  >> ctx.audio.bpm) {
    ctx.audio.beat = beat != 0;
    std::fill(leds.begin(), leds.end(), CRGB::Black);

    for (int index = 0; index < segmentCount; index += 1) {
      int start = 0;
      int stop = 0;
      int brightness = 255;
      int mode = 9;
      int speed = 128;
      int intensity = 128;
      int palette = 0;
      int on = 1;
      std::cin >> start >> stop >> brightness >> mode >> speed >> intensity >> palette >> on;

      ctx.segment.start = std::max(0, std::min<int>(start, leds.size()));
      ctx.segment.stop = std::max<int>(ctx.segment.start, std::min<int>(stop, leds.size()));
      ctx.segment.brightness = on ? clamp8((brightness * stateBrightness) / 255.0f) : 0;
      ctx.segment.mode = clamp8(mode);
      ctx.segment.speed = clamp8(speed);
      ctx.segment.intensity = clamp8(intensity);
      ctx.segment.palette = clamp8(palette);
      ctx.segment.colors[0] = readColor();
      ctx.segment.colors[1] = readColor();
      ctx.segment.colors[2] = readColor();

      if (on && ctx.segment.start < ctx.segment.stop) render(ctx);
    }

    std::cout << "{\"leds\":[";
    for (size_t i = 0; i < leds.size(); ++i) {
      if (i) std::cout << ',';
      std::cout << '['
                << static_cast<int>(leds[i].r) << ','
                << static_cast<int>(leds[i].g) << ','
                << static_cast<int>(leds[i].b) << ']';
    }
    std::cout << "]}" << std::endl;
  }
}

