# Architecture

This project runs the real WLED browser UI and mobile-app protocol against a local Node.js emulator. The emulator is not an ESP32 CPU emulator; it is a WLED-compatible HTTP/WebSocket facade plus a virtual LED output renderer.

## Runtime Flow

1. In development, `npm run dev` starts the standard Vite dev server.
2. `src/server/vite-plugin.ts` mounts the WLED-compatible HTTP/WebSocket emulator into Vite middleware and lets Vite own frontend modules, CSS, and HMR.
3. `src/server/http.ts` serves WLED-compatible JSON endpoints, vendored WLED UI assets, emulator pages, and frame/audio bridge endpoints.
4. `src/server/websocket.ts` handles the raw WLED WebSocket connection used by the WLED UI and the typed emulator frame/audio bus.
5. `src/emulator/main.ts` starts the browser-side emulator application through Vite.
6. `src/emulator/transport.ts` watches server state over HTTP polling and WebSocket updates.
7. `src/emulator/audio.ts` analyzes mic, computer/share, or audio-file input and streams normalized audio bands to the server.
8. `src/emulator/native-frame.ts` copies fresh native C++ RGB frames into the browser model and clears the LEDs when no fresh native frame exists.
9. `tools/generate-upstream-fx.mjs` extracts the supported upstream native effects and writes C++ sources plus a JSON support manifest.
10. `tools/run-cpp-effect.mjs` can compile and run the C++ harness, receive streamed audio, then stream compact RGB frames back into `/api/emulator/frames`.
11. For non-dev runs, `server.ts` creates the same app context and serves the built emulator assets from `dist/emulator/`.

## Server Modules

- `src/server/config.ts`: filesystem paths, local emulator state paths, port, and emulator version.
- `src/server/audio-state.ts`: normalization and typed bus payloads for emulator audio state.
- `src/server/context.ts`: process-local emulator state container.
- `src/server/edc-usermod.ts`: EDC Dance usermod effect registration metadata, persistent config normalization, presets, and the emulator Usermod Settings page.
- `src/server/vite-plugin.ts`: Vite development integration for WLED-compatible routes, WebSocket upgrades, HTML transforms, and frontend HMR.
- `src/server/fixture.ts`: daisy-chained ring geometry and default segment layout.
- `src/server/wled-catalog.ts`: parser for vendored WLED effect metadata and consumer of the generated native-support manifest.
- `src/server/device-state.ts`: WLED state creation, patch application, normalization, and live-preview LEDs.
- `src/server/wled-json.ts`: WLED-compatible JSON payloads.
- `src/server/http.ts`: route table and endpoint behavior.
- `src/server/websocket.ts`: WebSocket handshake, WLED state broadcast, and typed emulator frame/audio bus. It buffers partial frames per socket because TCP chunks are not message boundaries.
- `src/server/palettes.ts`: emulator palette names and RGB lookup data.
- `src/server/responses.ts`: JSON/text/static file response helpers.
- `src/server/presets.ts`: small preset payload served at `/presets.json`.
- `src/server/version-info.ts`: minimal WLED UI version-info file emulation and local persistence for the install/upgrade prompt.

## Browser Modules

- `src/emulator/app.ts`: app startup and animation loop.
- `src/emulator/model.ts`: shared mutable browser model.
- `src/emulator/dom.ts`: typed DOM element lookup.
- `src/emulator/transport.ts`: server fetch/poll/WebSocket integration, including the typed native-frame/audio WebSocket bus and native-frame HTTP fallback polling.
- `src/emulator/audio-core.ts`: shared Web Audio analysis, WLED mic FFT bin generation, PC-style direct-audio sync bin generation, and source-specific beat detection.
- `src/emulator/audio.ts`: main emulator audio controls for local mic/file playback plus opening the persistent capture window for computer/share audio.
- `src/emulator/audio-capture.ts`: detached mic/computer capture window that streams audio to the emulator frame bus and survives main `/emulator` reloads.
- `src/emulator/native-frame.ts`: native-frame consumer for the virtual output; it does not approximate WLED effects in JavaScript.
- `src/emulator/renderer.ts`: ring canvas and spectrum canvas painting.
- `src/emulator/color.ts`: color math, palette interpolation, and effect helper API.
- `src/emulator/readouts.ts`: side-panel state readouts.

Vite owns browser TypeScript and CSS in development and production builds. Development uses the normal `vite` CLI, serves `/src/emulator/*.ts` and `/src/emulator/style.css` through Vite, and leaves the vendored WLED UI untransformed. `npm run build` writes bundled browser assets under `dist/emulator/`, and `server.ts` prefers those built files for normal `npm start`. The WLED WebSocket handler only claims `/ws` and `/api/emulator/frames` upgrades so Vite's HMR websocket can stay connected.

The project pins Vite to the current Vite 7 line and aliases `rollup` to `@rollup/wasm-node`. This avoids macOS hardened-runtime/code-signing failures when Codex or other sandboxed hosts try to load Rollup/Rolldown native `.node` bindings, while keeping a standard Vite dev server and HMR workflow.

## Native Boundary

The native renderer owns effect execution. `tools/generate-upstream-fx.mjs` reads vendored WLED source and writes generated artifacts under `cpp_harness/generated/`:

- `upstream_fx_1d.cpp`: host-compilable upstream effect source.
- `upstream_fx_1d.hpp`: C++ dispatch table for the native harness.
- `upstream_fx_1d_modes.json`: server-readable support manifest.

Server code must not parse generated C++ to infer support. `src/server/wled-catalog.ts` uses the JSON manifest to expose supported effect slots, marks unsupported official slots as `RSVD`, and then registers usermod-contributed effect metadata from `src/server/edc-usermod.ts`. That mirrors WLED's `strip.addEffect(255, ...)` path while keeping one source of truth for emulator-visible custom effects.

The browser renderer is intentionally not an effect engine. It displays frames streamed to `/api/emulator/frames` or, as a fallback, posted to `/api/emulator/frame`; stale or missing native frames produce a dark fixture rather than a JavaScript approximation.

Native frame transport uses compact flat RGB hex strings end to end. The C++ process emits that format, the runner forwards typed `frame` messages over the emulator bus, the server broadcasts them without expanding, and `src/emulator/native-frame.ts` decodes them into the browser LED model just before painting.

Audio transport uses the same emulator bus. Browser audio sources send typed `audio` messages over `/api/emulator/frames`; the C++ runner consumes those messages directly and logs a warning if the bus is unavailable instead of polling the HTTP audio endpoint. The main emulator also consumes inbound `audio` bus messages for its readouts and FFT visualizer whenever it is not analyzing a local mic/file source. Computer/share capture runs in `/emulator/audio-capture.html` so its `MediaStream` belongs to a separate window and can keep streaming while the main emulator page reloads.

Native RGB frames already include WLED's final output brightness from the C++ harness. The harness keeps global brightness out of the effect feedback loop and applies it only when serializing the frame, matching WLED's output/show boundary more closely. The browser renderer draws those native frame values without applying WLED brightness a second time, but it does apply a canvas-only perceptual tone map so low-amplitude upstream effects remain visible on screen while bright pulses keep enough headroom to visibly decay.

The native harness keeps WLED segment environment state inside `HostStrip` segments keyed by the WLED segment ID passed from `tools/run-cpp-effect.mjs`, so upstream effects that allocate `SEGENV.data` or depend on `SEGENV.call` can evolve across frames independently on each ring.

AudioReactive compatibility is isolated in `cpp_harness/wled_audio_bridge.*`. The general WLED compatibility shim owns segment, strip, palette, timing, and effect registration behavior; the audio bridge owns emulator-audio normalization into WLED v16 `um_data_t` slots and the `UsermodManager::getUMData()` surface consumed by upstream audio effects.

`EDC Dance` treats active segments as the fixture topology. Ring propagation uses `strip.getCurrSegmentId()` and `strip.getActiveSegmentsNum()` rather than fixed LED-offset tables, so the same native effect can adapt to a different number of daisy-chained rings or different LED counts per ring.

## Documentation Rule

Behavioral changes, module-boundary changes, public routes, WLED protocol behavior, fixture geometry, native harness contracts, and developer commands must update `docs/` in the same change. If docs do not need edits, verify that explicitly during the change and keep the final note clear.

## Legacy Prototype

The pre-WLED standalone prototype is preserved under `legacy/standalone-prototype/`. It is not part of the active server route table.
