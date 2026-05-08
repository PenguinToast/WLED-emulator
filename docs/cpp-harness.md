# C++ Effect Harness

The C++ harness is the current path for iterating on native custom effects without flashing hardware.

## Files

- `cpp_harness/wled_effect_harness.hpp`: host-side compatibility surface for WLED-style effect functions.
- `cpp_harness/wled_compat.cpp`: implementation of `SEGMENT`, `strip`, palette/color helpers, timing, and audio globals.
- `cpp_harness/generated/upstream_fx_1d.cpp`: generated host-adapted source extracted from vendored WLED `FX.cpp`.
- `cpp_harness/generated/upstream_fx_1d.hpp`: generated dispatch table mapping official WLED mode IDs to compiled upstream functions.
- `cpp_harness/custom_effect.cpp`: `mode_edc_custom()` plus fallback only for modes not yet covered by the upstream host build.
- `cpp_harness/main.cpp`: stdin/stdout process wrapper that renders every active WLED segment once per frame.
- `tools/run-cpp-effect.mjs`: compiles the harness, polls emulator state/audio, and posts RGB frames back to `/api/emulator/frame`.
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

The browser emulator will display C++ frames while they are fresh. If the C++ streamer stops, the browser falls back to its JavaScript renderer.

`npm run cpp:run` regenerates the upstream host source before compiling. To regenerate without running the streamer:

```sh
npm run cpp:generate
```

The runner now sends the full WLED segment list to the native process each frame. Each segment is rendered with its own `start`, `stop`, brightness, mode, speed, intensity, palette, and color slots, matching the daisy-chained ring fixture more closely than the earlier single-segment path.

## Current Limitation

The server exposes the official WLED `v0.15.4` effect catalog plus one host custom slot, `EDC Custom` at ID `187`. The native renderer now compiles and dispatches the upstream WLED 1D non-SR effect functions from vendored `FX.cpp` for 115 official mode IDs. Modes that live in the later audio-reactive SR/2D section still fall back until the host shim grows enough of WLED's matrix and audio usermod surface.

`EDC Custom` remains written as a WLED-style `uint16_t mode_edc_custom(void)` function and is the preferred place to iterate on code intended to move into real WLED.
