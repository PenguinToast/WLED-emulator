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

For hot reloading during development:

```sh
npm run dev
```

For a normal local server:

```sh
npm start
```

Open:

- WLED UI: `http://localhost:5173/`
- Virtual LED/audio output: `http://localhost:5173/emulator`

The WLED mobile/native app can be pointed at the machine running this server, using port `5173`.

This is not a CPU-level ESP32 emulator and does not run WLED firmware internals. It emulates the WLED device protocol so the real WLED UI/app can control a virtual output.

## C++ effect loop

The server exposes the official WLED `v0.15.4` effect catalog from the vendored `FX.cpp` source: 187 mode slots with WLED IDs, names, and fxdata. Keep the server running, then run:

```sh
npm run cpp:run
```

The runner compiles the C++ renderer, pulls WLED state and live audio from the emulator server, and streams RGB frames back into `/emulator`. The browser renderer displays those C++ frames whenever they are active.

The browser emulator does not render JavaScript approximations of WLED effects. If the C++ streamer is not running, the virtual LEDs stay dark instead of showing a fake fallback.

Current native renderer status: the runner generates and compiles a host-adapted upstream `FX.cpp` slice from vendored WLED `v0.15.4`, dispatching 142 official non-2D mode IDs to real upstream functions. This includes the WLED-SR 1D audio-reactive modes, backed by a host `UsermodManager::getUMData()` shim that feeds upstream `um_data_t` audio fields from the emulator. Unsupported official slots are exposed as `RSVD` so WLED mode IDs stay stable while the UI avoids matrix-only effects the native shim cannot render. A host custom mode, `EDC Custom`, is appended at ID `187` so `cpp_harness/custom_effect.cpp` can define a WLED-style `uint16_t mode_edc_custom(void)` function that is much closer to code you can carry into a real WLED build.
