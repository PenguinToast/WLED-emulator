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

- Bass/kick transients create the dominant pulse as a travelling radial shockwave, not a whole-fixture fill. In the multi-segment ring fixture, pulse age maps to a moving wavefront across ring indices, so each ring gets a bright front and short afterglow as the wave crosses it. Hit strength controls brightness and outward reach, but not tail length: smaller kicks stay weighted toward the inner rings, while stronger hits push farther outward with less attenuation without smearing into the next beat.
- `Beat Focus` biases detection toward the dominant low-end rhythm instead of acting as a second audio gain control. Higher values require the kick to stand out more clearly from mid/high content, lock the dominant pulse to the learned primary-beat window sooner, and make snare/hat accents more selective.
- The kick detector uses a firmware-portable onset tracker rather than raw bass loudness: blended sub/punch energy is compared against a short smoothed baseline to produce positive flux, flux floors follow the current track's average and peak behavior, and accepted kicks train a small tempo/phase model. Accepted kicks are capped before they update the adaptive floor so dense drops do not immediately teach the detector that the new noise floor is normal. `samplePeak` can hint at a borderline onset, and once tempo confidence is established the detector waits for the learned kick phase before spawning the full shockwave. It can still rescue on-grid beats through dense sections where the kick is partially masked by synths/noise, and it can recover after a missed grid slot. Rescue hits slowly spend tempo confidence instead of reinforcing it, so breakdowns decay out instead of pulsing forever.
- Learned tempo also shapes pulse motion. Slower intervals stretch pulse lifetime and outward propagation for deeper rumbling movement, while faster intervals shorten both so hard techno reads as quick repeated impacts.
- The detector is intentionally ESP32-S3 friendly: byte-sized band state, integer IIR filters, no heap allocation beyond normal WLED `SEGENV` effect data, and no local FFT/ML work inside the effect. It consumes the same `fftResult[16]`, `volumeSmth`, and `samplePeak` values that WLED-SR audio-reactive effects already receive.
- Sustained or off-grid bass energy creates a lower-level automatic rumble glow instead of repeatedly retriggering the full kick pulse.
- Snare-like mid-band transients create shorter accent-color pulses.
- Hi-hat/high-band transients add brief sparse accent pulses only on detected high-band hits, not continuously while music is playing.
- On the EDC multi-segment ring fixture, each active segment is treated as the next physical ring. The effect asks WLED for the current segment ID and active segment count instead of hardcoding LED offsets, so varied ring counts and varied LEDs per ring can be tested by changing the segment layout.
- Colors come from normal WLED color slots: primary drives kick/bass, secondary drives snare accents, and tertiary drives high sparkle/rumble accents. Selecting a palette adds subtle color progression across beats and rings.

The custom mode exposes WLED sliders for live tuning only where the automatic detector cannot know the desired show feel:

- `Speed`: outward propagation speed between rings.
- `Beat Focus`: how strongly the effect prioritizes the main low-end beat over secondary mid/high accents. This is a musical selectivity control, not a gain control.
- `Tightness`: kick pulse decay, higher values are shorter and more beat-locked.
- `Impact`: visual punch and outward reach for detected hits. Higher values make strong hits carry farther through the fixture and diffuser preview.
- `Accent Mix`: live amount of snare/hat style accents. Higher values allow more mid/high transient pulses and scales them up; lower values leaves the kick pulse more dominant.

The effect intentionally does not expose a live audio-gain or bass-threshold slider. The WLED/SR-style audio path already has input/FFT tuning, and the custom effect continuously adapts its onset floors and tempo model to the current track. The remaining sliders are aesthetic or musical-balance controls that are reasonable to touch during a set.

## Carrying Code To Real WLED

For real firmware, carry the `EDC Dance` usermod shape forward: implement a `Usermod` subclass, load persistent fields with `readFromConfig()`, save them with `addToConfig()`, optionally decorate the Usermod Settings page with `appendConfigData()`, and register the effect in `setup()` with `strip.addEffect(255, &mode_edc_custom, _data_FX_MODE_EDC_CUSTOM)`.

Keep effects inside the compatibility surface above if you want local behavior to remain close to real WLED behavior. 2D matrix helpers and the full upstream FastLED/noise API are not shimmed yet.

## Usermod Configuration

The emulator exposes the EDC usermod settings at `/settings/um` and as JSON at `/api/usermods/edc`. The values are persisted in `.edc-emulator/edc-usermod.json` and are sent to the native harness once per frame, mirroring how a real WLED build would have `cfg.json` values loaded before the effect runs.

Current static knobs are deliberately installation/audio-behavior oriented rather than color choices:

- `enabled`: allows disabling the custom effect without removing it from the catalog.
- `preset`: settings-page shortcut that loads a baseline group of the fields below. Presets are not meant to be changed between songs.
- `autoAdapt`: enables the effect's dynamic onset floors and tempo model. This should normally stay on; disabling it is mainly a diagnostic/manual fallback.
- `segmentDelayMs`: base outward propagation delay per active segment.
- `outwardFade`: baseline attenuation applied as pulses move through later segments. The effect adds more attenuation for weaker pulses so loud hits travel farther than smaller accents.
- `rumbleAmount`: sustained-bass glow for long low-end energy that should not retrigger the main kick pulse.
- `accentAmount`: installation-wide output scale for snare and hi-hat style pulses, before the live `Accent Mix` slider.
- `primaryMinGapMs`: minimum retrigger spacing for the dominant beat pulse, useful when an installation or audio path is unusually prone to double hits.

## Track Evaluation

Use `tools/evaluate-edc-audio.mjs` for repeatable offline checks against real tracks:

```sh
node tools/evaluate-edc-audio.mjs --seconds 75 --offset 15 artifacts/audio/track.mp3
node tools/evaluate-edc-audio.mjs --beat-focus 160 --impact 190 artifacts/audio/track.mp3
node tools/evaluate-edc-audio.mjs --truth-bpm 128 artifacts/audio/known-128bpm-house-loop.ogg
```

The tool decodes audio with `ffmpeg`, builds 16 normalized PC-sync-style analyzer bins, feeds the native C++ harness, and reports analyzer peaks, tempo-grid ground truth, visual pulse count, beat/pulse matches, median lag, and tail duty. It estimates ground truth by deriving an onset envelope, choosing a likely tempo by autocorrelation, and aligning a beat grid to the strongest onset phase; `--truth-bpm` can override the tempo when a sample has known BPM metadata. This is stricter for house/techno than the older transient-thinning check because it scores against the musical beat grid instead of every low-frequency bump. The `truthConfidence`/`truthReliable` fields should be checked before trusting recall and precision for breakbeat or dubstep samples that may not have a steady beat grid. Downloaded test tracks should be kept in `artifacts/audio/`, whose contents are gitignored.

Recent detector tuning used the cached Nihilore tracks plus three temporary Wikimedia Commons samples so house and dubstep are represented:

- `Bigroom house drop loop 30 sec.ogg`: 30s house/four-on-floor loop, Wikimedia Commons.
- `Dubstep Loop by WinnieTheMoog.ogg`: 29s dubstep loop, Wikimedia Commons.
- `Dubstep drop example.ogg`: 30s dubstep drop, Wikimedia Commons.

With the ESP32-S3-friendly onset tracker and current live-control defaults, the 30s house reference estimates a 128.6 BPM grid with high confidence and the visual pulses match 59 of 65 beats after the dense-drop rescue pass. Across the broader mixed test set, low tail duty remains the main safety check; low-confidence tempo grids on dubstep references are useful for smoke testing response, but not as authoritative beat labels.

Additional known-BPM checks are kept locally under `artifacts/audio/`:

- `ccmixter-q6-nadeya-deep-house-128.mp3`: Q6, "Nadeya Deep House Remix", BPM 128. The 60s window at offset 45s produced 129 visual hits, 95 matches, 0ms median lag, and 0 tail duty. The phase confidence is low, so treat this as a musical smoke test rather than strict ground truth.
- `ccmixter-myfreemickey-techno-kit-130.mp3`: My Free Mickey, "techno kit", BPM 130. The 60s window at offset 20s produced 110 visual hits, 96 matches, 0ms median lag, and 0 tail duty.
- `ccmixter-party-redlight-trance-edm-project-03-138.mp3`: P7R7L5, "Trance&EDM project 03", BPM 138. The 60s window at offset 20s produced a reliable 138.5 BPM grid, 131 visual hits, 110 matches, 0ms median lag, and 0 tail duty.
