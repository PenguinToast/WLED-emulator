# Architecture

This project runs the real WLED browser UI and mobile-app protocol against a local Node.js emulator. The emulator is not an ESP32 CPU emulator; it is a WLED-compatible HTTP/WebSocket facade plus a virtual LED output renderer.

## Runtime Flow

1. `server.mjs` creates one app context and starts the HTTP server.
2. `src/server/http.mjs` serves WLED-compatible JSON endpoints, vendored WLED UI assets, emulator pages, and frame/audio bridge endpoints.
3. `src/server/websocket.mjs` handles the raw WLED WebSocket connection used by the WLED UI.
4. `public/emulator/main.js` starts the browser-side emulator application.
5. `public/emulator/js/transport.js` watches server state over HTTP polling and WebSocket updates.
6. `public/emulator/js/audio.js` analyzes mic or audio-file input and posts normalized audio bands to the server.
7. `public/emulator/js/effects.js` renders browser fallback frames unless an external C++ frame stream is active.
8. `tools/generate-upstream-fx.mjs` extracts the supported upstream native effects and writes C++ sources plus a JSON support manifest.
9. `tools/run-cpp-effect.mjs` can compile and run the C++ harness, then stream RGB frames back into `/api/emulator/frame`.

## Server Modules

- `src/server/config.mjs`: filesystem paths and port.
- `src/server/context.mjs`: process-local emulator state container.
- `src/server/fixture.mjs`: daisy-chained ring geometry and default segment layout.
- `src/server/wled-catalog.mjs`: parser for vendored WLED effect metadata and consumer of the generated native-support manifest.
- `src/server/device-state.mjs`: WLED state creation, patch application, normalization, and live-preview LEDs.
- `src/server/wled-json.mjs`: WLED-compatible JSON payloads.
- `src/server/http.mjs`: route table and endpoint behavior.
- `src/server/websocket.mjs`: WebSocket handshake, frame encoding/decoding, and state broadcast.
- `src/server/palettes.mjs`: emulator palette names and RGB lookup data.
- `src/server/responses.mjs`: JSON/text/static file response helpers.
- `src/server/presets.mjs`: small preset payload served at `/presets.json`.

## Browser Modules

- `public/emulator/js/app.js`: app startup and animation loop.
- `public/emulator/js/model.js`: shared mutable browser model.
- `public/emulator/js/dom.js`: DOM element lookup.
- `public/emulator/js/transport.js`: server fetch/poll/WebSocket integration.
- `public/emulator/js/audio.js`: Web Audio input, band analysis, beat detection, and audio posting.
- `public/emulator/js/effects.js`: browser fallback renderer and custom-effect editor glue.
- `public/emulator/js/renderer.js`: ring canvas and spectrum canvas painting.
- `public/emulator/js/color.js`: color math, palette interpolation, and effect helper API.
- `public/emulator/js/readouts.js`: side-panel state readouts.

## Native Boundary

The native renderer owns effect execution. `tools/generate-upstream-fx.mjs` reads vendored WLED source and writes generated artifacts under `cpp_harness/generated/`:

- `upstream_fx_1d.cpp`: host-compilable upstream effect source.
- `upstream_fx_1d.hpp`: C++ dispatch table for the native harness.
- `upstream_fx_1d_modes.json`: server-readable support manifest.

Server code must not parse generated C++ to infer support. `src/server/wled-catalog.mjs` uses the JSON manifest to expose supported effect slots and marks unsupported official slots as `RSVD`, preserving WLED mode IDs while keeping the UI away from native-unimplemented modes.

## Documentation Rule

Behavioral changes, module-boundary changes, public routes, WLED protocol behavior, fixture geometry, native harness contracts, and developer commands must update `docs/` in the same change. If docs do not need edits, verify that explicitly during the change and keep the final note clear.

## Legacy Prototype

The pre-WLED standalone prototype is preserved under `legacy/standalone-prototype/`. It is not part of the active server route table.
