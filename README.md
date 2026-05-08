# EDC WLED Protocol Emulator

This project runs the real WLED web UI against a local WLED-compatible protocol emulator. The emulator exposes WLED-style HTTP JSON and WebSocket endpoints, and `/emulator` renders the virtual LED output with microphone or audio-file input.

## Docs

- `docs/architecture.md`: module boundaries and runtime flow.
- `docs/fixture.md`: daisy-chained ring layout and segment ranges.
- `docs/wled-protocol.md`: HTTP/WebSocket protocol surface.
- `docs/cpp-harness.md`: native effect harness workflow and limitations.
- `docs/custom-effects.md`: WLED-style custom effect compatibility surface.
- `docs/development.md`: commands, routes, and refactor boundaries.

## Run

```sh
npm start
```

Open:

- WLED UI: `http://localhost:5173/`
- Virtual LED/audio output: `http://localhost:5173/emulator`

The WLED mobile/native app can be pointed at the machine running this server, using port `5173`.

## Custom effect API

In the WLED UI, select `Custom Effect ♪♫`. Then edit the function in `/emulator` and press `Run`. `Cmd+Enter` also compiles the editor.

```js
function render({ leds, time, frame, audio, segment, state, palette, helpers }) {
  helpers.fade(leds, 0.85);
  helpers.setPixel(leds, 0, palette(time * 0.1, audio.volume));
}
```

Inputs:

- `leds`: array of `[r, g, b]` values, one entry per virtual LED.
- `time`: seconds since page load.
- `frame`: animation frame counter.
- `audio.volume`: RMS volume normalized to `0..1`.
- `audio.bass`, `audio.mid`, `audio.treble`: normalized band levels.
- `audio.bins`: 64-band normalized spectrum.
- `audio.beat`: boolean beat trigger.
- `audio.bpm`: rough estimated BPM after several beats.
- `segment.sx`, `segment.ix`, `state.bri`: WLED speed, intensity, and brightness values from `0..255`.
- `palette(position, brightness)`: returns an RGB color, with `position` wrapping around `0..1`.
- `helpers`: `hsv`, `fill`, `fade`, `setPixel`, `addPixel`, `color`.

This is not a CPU-level ESP32 emulator and does not run WLED firmware internals. It emulates the WLED device protocol so the real WLED UI/app can control a virtual output.

## C++ effect loop

The server exposes the official WLED `v0.15.4` effect catalog from the vendored `FX.cpp` source: 187 mode slots with WLED IDs, names, and fxdata. Keep the server running, then run:

```sh
npm run cpp:run
```

The runner compiles the C++ renderer, pulls WLED state and live audio from the emulator server, and streams RGB frames back into `/emulator`. The browser renderer displays those C++ frames whenever they are active.

Current native renderer status: the runner generates and compiles a host-adapted upstream `FX.cpp` slice from vendored WLED `v0.15.4`, dispatching 115 official 1D non-SR mode IDs to real upstream functions. A host custom mode, `EDC Custom`, is appended at ID `187` so `cpp_harness/custom_effect.cpp` can define a WLED-style `uint16_t mode_edc_custom(void)` function that is much closer to code you can carry into a real WLED build. Later audio-reactive SR/2D modes still need more shim work.
