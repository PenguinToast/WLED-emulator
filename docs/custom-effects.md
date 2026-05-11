# WLED-Style Custom Effects

The C++ harness now supports a WLED-style effect function rather than a separate host-only API. The target shape is:

```cpp
uint16_t mode_edc_custom(void) {
  SEGMENT.fadeToBlackBy(38);
  for (uint16_t i = 0; i < SEGLEN; i += 1) {
    SEGMENT.setPixelColor(i, SEGMENT.color_from_palette(i, true, true, 0));
  }
  return FRAMETIME;
}
```

This is intentionally close to functions in WLED `FX.cpp`: no `EffectContext` parameter, segment access through `SEGMENT`, timing through `strip.now`, colors through `SEGCOLOR()`, and frame cadence through `FRAMETIME`.

## Local Harness Surface

The host compatibility layer in `cpp_harness/wled_effect_harness.hpp` currently supports the common 1D APIs used by many real WLED effects:

- `SEGMENT`, `SEGENV`, `SEGCOLOR(x)`, `SEGLEN`, `FRAMETIME`, `strip.now`
- `SEGMENT.speed`, `SEGMENT.intensity`, `SEGMENT.palette`, `SEGMENT.mode`, `SEGMENT.colors`
- `SEGMENT.setPixelColor()`, `getPixelColor()`, `fill()`, `fade_out()`, `fadeToBlackBy()`, `blur()`
- `SEGMENT.blendPixelColor()`, `addPixelColor()`, `fadePixelColor()`
- `SEGMENT.color_wheel()` and `SEGMENT.color_from_palette()`
- `color_blend()`, `color_add()`, `color_fade()`, `RGBW32()`, `CRGB`, `CHSV`
- `random8()`, `random16()`, `sin8_t()`, `cos8_t()`, `sin16_t()`, `cos16_t()`, `beat8()`, `beat16()`, `beatsin8_t()`, `beatsin16_t()`, `map()`, `mapf()`, `constrain()`, `millis()`, `micros()`

Audio-reactive compatibility globals are also populated from the browser audio analyzer. The emulator can feed that analyzer from mic input, computer/share capture, or audio-file playback:

- `volumeSmth`
- `samplePeak`
- `fftResult[16]`
- `fftBin[16]`
- `FFT_MajorPeak`

## Active Custom Mode

The server appends one host custom mode after the official WLED `v0.15.4` catalog:

- ID `187`: `EDC Custom`

Select `EDC Custom` in the real WLED UI, run `npm run cpp:run`, and the browser emulator will display frames rendered by `mode_edc_custom()` in `cpp_harness/custom_effect.cpp`.

The current EDC effect is a beat-based pulse renderer for the daisy-chained ring fixture:

- Bass/kick transients create the dominant pulse, radiating from the center ring outward with a short decay so normal EDM kicks read as tight hits.
- The kick detector tracks the current song's low-band baseline, low-band peak, and recent kick spacing so the main pulse adapts across different EDM mixes instead of relying on one fixed bass threshold.
- Sustained bass energy creates a lower-level automatic rumble glow instead of repeatedly retriggering the full kick pulse.
- Snare-like mid-band transients create shorter accent-color pulses.
- Hi-hat/high-band transients add brief sparse accent pulses only on detected high-band hits, not continuously while music is playing.
- On the EDC multi-segment ring fixture, each ring segment is delayed by its ring position so the pulse travels outward. On a single segment, the same code falls back to a center-out strip pulse.
- Colors come from normal WLED color slots: primary drives kick/bass, secondary drives snare accents, and tertiary drives high sparkle/rumble accents. Selecting a palette adds subtle color progression across beats and rings.

The custom mode exposes WLED sliders as:

- `Speed`: propagation speed
- `Sensitivity`: audio hit strength
- `Tightness`: kick pulse decay, higher values are shorter and more beat-locked
- `Bass Adapt`: how strongly kick detection follows the current track's low-end baseline, peak, and learned kick spacing
- `Accent Gate`: how selective snare and hi-hat transient detection should be; higher values require cleaner mid/high hits

## Carrying Code To Real WLED

For real firmware, copy the `mode_edc_custom()` function body into WLED's effect source or a custom effect/usermod integration and register it with WLED's normal `addEffect(...)` path. The host-only file wrapper, includes, and fallback modes are not meant to be copied.

Keep effects inside the compatibility surface above if you want local behavior to remain close to real WLED behavior. 2D matrix helpers and the full upstream FastLED/noise API are not shimmed yet.
