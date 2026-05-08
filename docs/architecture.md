# Architecture

This project runs the real WLED browser UI and mobile-app protocol against a local Node.js emulator. The emulator is not an ESP32 CPU emulator; it is a WLED-compatible HTTP/WebSocket facade plus a virtual LED output renderer.

## Runtime Flow

1. `server.ts` creates one app context and starts the HTTP server.
2. In development, `src/server/dev.ts` attaches Vite middleware and injects the Vite client into emulator HTML only.
3. `src/server/http.ts` serves WLED-compatible JSON endpoints, vendored WLED UI assets, emulator pages, and frame/audio bridge endpoints.
4. `src/server/websocket.ts` handles the raw WLED WebSocket connection used by the WLED UI.
5. `src/emulator/main.ts` starts the browser-side emulator application through Vite.
6. `src/emulator/transport.ts` watches server state over HTTP polling and WebSocket updates.
7. `src/emulator/audio.ts` analyzes mic or audio-file input and posts normalized audio bands to the server.
8. `src/emulator/native-frame.ts` copies fresh native C++ RGB frames into the browser model and clears the LEDs when no fresh native frame exists.
9. `tools/generate-upstream-fx.mjs` extracts the supported upstream native effects and writes C++ sources plus a JSON support manifest.
10. `tools/run-cpp-effect.mjs` can compile and run the C++ harness, then stream RGB frames back into `/api/emulator/frame`.

## Server Modules

- `src/server/config.ts`: filesystem paths, port, and emulator version.
- `src/server/context.ts`: process-local emulator state container.
- `src/server/dev.ts`: Vite middleware and HTML transform helpers for development hot reload.
- `src/server/fixture.ts`: daisy-chained ring geometry and default segment layout.
- `src/server/wled-catalog.ts`: parser for vendored WLED effect metadata and consumer of the generated native-support manifest.
- `src/server/device-state.ts`: WLED state creation, patch application, normalization, and live-preview LEDs.
- `src/server/wled-json.ts`: WLED-compatible JSON payloads.
- `src/server/http.ts`: route table and endpoint behavior.
- `src/server/websocket.ts`: WebSocket handshake, frame encoding/decoding, and state broadcast.
- `src/server/palettes.ts`: emulator palette names and RGB lookup data.
- `src/server/responses.ts`: JSON/text/static file response helpers.
- `src/server/presets.ts`: small preset payload served at `/presets.json`.
- `src/server/version-info.ts`: minimal WLED UI version-info file emulation for the install/upgrade prompt.

## Browser Modules

- `src/emulator/app.ts`: app startup and animation loop.
- `src/emulator/model.ts`: shared mutable browser model.
- `src/emulator/dom.ts`: typed DOM element lookup.
- `src/emulator/transport.ts`: server fetch/poll/WebSocket integration.
- `src/emulator/audio.ts`: Web Audio input, band analysis, beat detection, and audio posting.
- `src/emulator/native-frame.ts`: native-frame consumer for the virtual output; it does not approximate WLED effects in JavaScript.
- `src/emulator/renderer.ts`: ring canvas and spectrum canvas painting.
- `src/emulator/color.ts`: color math, palette interpolation, and effect helper API.
- `src/emulator/readouts.ts`: side-panel state readouts.

Vite owns browser TypeScript in development and production builds. Development serves `/src/emulator/*.ts` directly through Vite middleware and leaves the vendored WLED UI untransformed; `npm run build` writes bundled browser assets under `dist/emulator/`, and the server prefers those built files for normal `npm start`.

## Native Boundary

The native renderer owns effect execution. `tools/generate-upstream-fx.mjs` reads vendored WLED source and writes generated artifacts under `cpp_harness/generated/`:

- `upstream_fx_1d.cpp`: host-compilable upstream effect source.
- `upstream_fx_1d.hpp`: C++ dispatch table for the native harness.
- `upstream_fx_1d_modes.json`: server-readable support manifest.

Server code must not parse generated C++ to infer support. `src/server/wled-catalog.ts` uses the JSON manifest to expose supported effect slots and marks unsupported official slots as `RSVD`, preserving WLED mode IDs while keeping the UI away from native-unimplemented modes.

The browser renderer is intentionally not an effect engine. It displays frames posted to `/api/emulator/frame`; stale or missing native frames produce a dark fixture rather than a JavaScript approximation.

The native harness keeps WLED segment environment state inside `HostStrip` segments keyed by the WLED segment ID passed from `tools/run-cpp-effect.mjs`, so upstream effects that allocate `SEGENV.data` or depend on `SEGENV.call` can evolve across frames independently on each ring.

## Documentation Rule

Behavioral changes, module-boundary changes, public routes, WLED protocol behavior, fixture geometry, native harness contracts, and developer commands must update `docs/` in the same change. If docs do not need edits, verify that explicitly during the change and keep the final note clear.

## Legacy Prototype

The pre-WLED standalone prototype is preserved under `legacy/standalone-prototype/`. It is not part of the active server route table.
