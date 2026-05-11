# WLED-Style Usermod Effects

The EDC effect is modeled as a WLED v2 usermod that registers a WLED-style effect function. Current WLED guidance for personal/custom effects is to keep the mode function in the usermod and call `strip.addEffect(255, &mode_fn, _data_fx)` from `setup()`, where `255` asks WLED for the first available usermod effect slot.

The effect body still has the normal `FX.cpp` shape:

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

## Active Usermod Mode

The `EDC Dance` usermod registers one effect after the official WLED `v0.15.4` catalog:

- ID `187`: `EDC Custom`

Select `EDC Custom` in the real WLED UI, run `npm run cpp:run`, and the browser emulator will display frames rendered by `mode_edc_custom()` in `cpp_harness/edc_usermod.cpp`.

The current EDC effect is a beat-based pulse renderer for the daisy-chained ring fixture:

- Bass/kick transients create the dominant pulse, radiating from the center ring outward with a short decay so normal EDM kicks read as tight hits. Hit strength controls both brightness and outward reach: smaller kicks stay weighted toward the inner rings, while stronger hits push farther outward with less attenuation.
- `Beat Focus` biases detection toward the dominant low-end rhythm instead of acting as a second audio gain control. Higher values require the kick to stand out more clearly from mid/high content and make snare/hat accents more selective.
- The kick detector uses a firmware-portable onset tracker rather than raw bass loudness: blended sub/punch energy is compared against a short smoothed baseline to produce positive flux, flux floors follow the current track's average and peak behavior, and accepted kicks train a small tempo/phase model. `samplePeak` can hint at a borderline onset, but it does not trigger a pulse by itself.
- The detector is intentionally ESP32-S3 friendly: byte-sized band state, integer IIR filters, no heap allocation beyond normal WLED `SEGENV` effect data, and no local FFT/ML work inside the effect. It consumes the same `fftResult[16]`, `volumeSmth`, and `samplePeak` values that WLED-SR audio-reactive effects already receive.
- Sustained bass energy creates a lower-level automatic rumble glow instead of repeatedly retriggering the full kick pulse.
- Snare-like mid-band transients create shorter accent-color pulses.
- Hi-hat/high-band transients add brief sparse accent pulses only on detected high-band hits, not continuously while music is playing.
- On the EDC multi-segment ring fixture, each active segment is treated as the next physical ring. The effect asks WLED for the current segment ID and active segment count instead of hardcoding LED offsets, so varied ring counts and varied LEDs per ring can be tested by changing the segment layout.
- Colors come from normal WLED color slots: primary drives kick/bass, secondary drives snare accents, and tertiary drives high sparkle/rumble accents. Selecting a palette adds subtle color progression across beats and rings.

The custom mode exposes WLED sliders as:

- `Speed`: propagation speed
- `Beat Focus`: how strongly the effect prioritizes the main low-end beat over secondary mid/high accents
- `Tightness`: kick pulse decay, higher values are shorter and more beat-locked
- `Bass Adapt`: how strongly kick detection follows the current track's low-end baseline, peak, and learned kick spacing
- `Accent Gate`: how selective snare and hi-hat transient detection should be; higher values require cleaner mid/high hits

## Carrying Code To Real WLED

For real firmware, carry the `EDC Dance` usermod shape forward: implement a `Usermod` subclass, load persistent fields with `readFromConfig()`, save them with `addToConfig()`, optionally decorate the Usermod Settings page with `appendConfigData()`, and register the effect in `setup()` with `strip.addEffect(255, &mode_edc_custom, _data_FX_MODE_EDC_CUSTOM)`.

Keep effects inside the compatibility surface above if you want local behavior to remain close to real WLED behavior. 2D matrix helpers and the full upstream FastLED/noise API are not shimmed yet.

## Usermod Configuration

The emulator exposes the EDC usermod settings at `/settings/um` and as JSON at `/api/usermods/edc`. The values are persisted in `.edc-emulator/edc-usermod.json` and are sent to the native harness once per frame, mirroring how a real WLED build would have `cfg.json` values loaded before the effect runs.

Current static knobs are deliberately installation/audio-behavior oriented rather than color choices:

- `enabled`: allows disabling the custom effect without removing it from the catalog.
- `preset`: optional starting points for broad EDM families; adaptive analysis should remain the main behavior during a set.
- `autoAdapt`: enables the effect's dynamic bass/accent thresholds.
- `segmentDelayMs`: base outward propagation delay per active segment.
- `outwardFade`: baseline attenuation applied as pulses move through later segments. The effect adds more attenuation for weaker pulses so loud hits travel farther than smaller accents.
- `rumbleAmount`: sustained-bass floor used for long low-end energy.
- `accentAmount`: relative weight for snare and hi-hat style pulses.
- `primaryMinGapMs`: minimum spacing for the dominant beat pulse.

## Track Evaluation

Use `tools/evaluate-edc-audio.mjs` for repeatable offline checks against real tracks:

```sh
node tools/evaluate-edc-audio.mjs --seconds 75 --offset 15 /path/to/track.mp3
node tools/evaluate-edc-audio.mjs --beat-focus 160 --bass-adapt 190 /path/to/track.mp3
```

The tool decodes audio with `ffmpeg`, builds 16 normalized PC-sync-style analyzer bins, feeds the native C++ harness, and reports raw analyzer beat flags, thinned primary beat candidates, visual pulse count, beat/pulse matches, median lag, and tail duty. It is meant for comparative tuning of `EDC Custom`; downloaded test tracks should stay outside the repo. Treat the precision/recall numbers as comparative signals, not absolute truth, because the "ground truth" beat list is generated by a separate offline detector rather than hand-labeled beats. Current defaults use `Beat Focus = 150`, which tested as a better cross-track balance than the stricter earlier value of `190`.

Recent detector tuning used the cached Nihilore tracks plus three temporary Wikimedia Commons samples so house and dubstep are represented:

- `Bigroom house drop loop 30 sec.ogg`: 30s house/four-on-floor loop, Wikimedia Commons.
- `Dubstep Loop by WinnieTheMoog.ogg`: 29s dubstep loop, Wikimedia Commons.
- `Dubstep drop example.ogg`: 30s dubstep drop, Wikimedia Commons.

With the ESP32-S3-friendly onset tracker, the 30s smoke-test pass landed around 0.69-0.86 recall, 0.78-0.93 precision, 0-33ms median visual lag, and 0.2%-4.1% tail duty across the five tracks. The important acceptance criterion is not a perfect score against synthetic ground truth; it is high precision, low tail duty, and visible response on clean house/dubstep references without retrigger spam.
