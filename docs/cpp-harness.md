# C++ Effect Harness

The C++ harness is the current path for iterating on native custom effects without flashing hardware.

## Files

- `cpp_harness/wled_effect_harness.hpp`: host-side compatibility surface for WLED-style effect functions.
- `cpp_harness/wled_compat.cpp`: implementation of `SEGMENT`, `strip`, palette/color helpers, timing, and the host AudioReactive usermod data exchange.
- `cpp_harness/generated/upstream_fx_1d.cpp`: generated host-adapted source extracted from vendored WLED `FX.cpp`.
- `cpp_harness/generated/upstream_fx_1d.hpp`: generated dispatch table mapping official WLED mode IDs to compiled upstream functions.
- `cpp_harness/generated/upstream_fx_1d_modes.json`: generated support manifest consumed by the server effect catalog.
- `cpp_harness/custom_effect.cpp`: `mode_edc_custom()` and native dispatch into generated upstream effects.
- `cpp_harness/main.cpp`: stdin/stdout process wrapper that renders every active WLED segment once per frame.
- `tools/run-cpp-effect.mjs`: compiles the harness, polls emulator state/audio, and streams RGB frames back to `/api/emulator/frames`.
- `tools/benchmark-frame-pipeline.mjs`: measures raw C++ frame throughput and end-to-end WebSocket frame-stream throughput.
- `tools/generate-upstream-fx.mjs`: regenerates the host-adapted upstream source and dispatch header from `vendor/wled-0.15.4/wled00/FX.cpp`.

## Run Loop

Start the protocol emulator:

```sh
npm start
```

In another terminal, start the C++ streamer:

```sh
npm run cpp:run
```

The browser emulator will display C++ frames while they are fresh. If the C++ streamer stops, the browser clears the virtual LEDs rather than rendering a JavaScript approximation.

`npm run cpp:run` regenerates the upstream host source before compiling. To regenerate without running the streamer:

```sh
npm run cpp:generate
```

The runner now sends the full WLED segment list to the native process each frame. Each segment is rendered with its own `id`, `start`, `stop`, brightness, mode, speed, intensity, palette, and color slots, matching the daisy-chained ring fixture more closely than the earlier single-segment path.

Native segment state is persistent per segment ID. `SEGENV.data`, `SEGENV.call`, and related fields are preserved across frames unless an effect requests a different allocation size, which is required for upstream modes such as Bouncing Balls and Aurora.

The 1D shim also decodes WLED's virtual-strip pixel indexes back to local segment coordinates. Several upstream 1D effects use that encoding even when there is only one virtual strip.

The math shim keeps WLED's signed 16-bit trig contract for `sin16_t()` and `cos16_t()`. Effects such as Breathe depend on negative-to-positive sine output and will hard-clip if those helpers are treated as unsigned waves.

The host `beat*()`, `beatsin*()`, `triwave8()`, and `nscale8_video()` helpers preserve WLED/FastLED-style integer wrapping and video-scaling behavior. Some upstream modes pass intentionally wrapped 8-bit ranges such as `-64, 64`; clamping those ranges changes phase motion into pinned output.

When a segment changes mode or bounds, the shim resets that segment's runtime fields and allocated data, matching WLED's expectation that a new effect starts with a clean segment environment.

The runner sends process-relative uptime seconds to the native process so `millis()`/`strip.now` retain frame-level precision for physics-style effects.

The runner renders frames at a fast cadence from cached emulator state, refreshing WLED state/audio controls separately. This keeps the native frame stream smooth without fetching the full catalog-sized state payload every frame.

Frames include a runner stream ID and a monotonically increasing frame number. The runner streams them over `/api/emulator/frames` when possible and falls back to HTTP POSTs; the server ignores stale frames within the same stream so delayed older data cannot overwrite newer LED data, while still accepting fresh frames after runner restarts.

The native process emits compact flat RGB hex lines to stdout. The runner preserves that compact RGB representation over the browser WebSocket instead of expanding every frame into nested arrays; the emulator UI decodes the flat RGB frame immediately before painting.

## Benchmarking

With the protocol server and C++ runner active, measure the frame pipeline with:

```sh
node tools/benchmark-frame-pipeline.mjs
```

The benchmark reports raw native-process throughput and WebSocket receive throughput separately. In the 7-ring, 133-LED fixture, raw native effect rendering should be thousands of frames per second, while the streamed emulator path should land near display cadence at roughly 60 FPS.

## Upstream Effect Coverage

The server exposes the official WLED `v0.15.4` effect catalog plus one host custom slot, `EDC Custom` at ID `187`. The native renderer compiles and dispatches 142 official non-2D mode IDs from vendored `FX.cpp`, including the upstream WLED-SR 1D audio-reactive effects such as Pixels, Pixelwave, Juggles, Matripix, Gravimeter, Freqwave, Waterfall, Freqpixels, Noisefire, Noisemove, Ripple Peak, Freqmap, DJ Light, Blurz, and Rocktaves.

The JSON effect catalog is derived from the generated native dispatch table. Unsupported official slots stay in the array as `RSVD` so WLED mode IDs remain stable, but the WLED UI/app does not offer matrix-only effects that the host shim cannot render.

The server consumes `upstream_fx_1d_modes.json` for this supported-mode contract. Keep that as the boundary between native generation and WLED protocol serving; server modules should not inspect generated C++ headers or source files.

The host shim implements `UsermodManager::getUMData()` for `USERMOD_ID_AUDIOREACTIVE` and feeds the upstream `um_data_t` fields from emulator audio:

- `u_data[0]`: smoothed volume, `volumeSmth`
- `u_data[1]`: raw volume, `volumeRaw`
- `u_data[2]`: 16-bin FFT byte array, `fftResult`
- `u_data[3]`: beat flag, `samplePeak`
- `u_data[4]`: dominant frequency estimate, `FFT_MajorPeak`
- `u_data[5]`: FFT magnitude estimate, `my_magnitude`
- `u_data[6]` and `u_data[7]`: mutable `maxVol` and `binNum` controls used by several SR effects
- `u_data[8]`: float FFT bin array, `fftBin`

Modes that require WLED's 2D matrix renderer are still intentionally skipped in the generated dispatch until the host fixture grows matrix geometry.

`EDC Custom` remains written as a WLED-style `uint16_t mode_edc_custom(void)` function and is the preferred place to iterate on code intended to move into real WLED.
