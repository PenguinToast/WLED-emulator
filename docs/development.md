# Development Notes

## Commands

```sh
npm run dev
npm start
npm run audit:native
npm run cpp:run
```

`npm run dev` starts the standard Vite dev server on `http://127.0.0.1:5173`. The Vite config mounts the WLED-compatible emulator routes through `src/server/vite-plugin.ts`, so frontend TypeScript and CSS use normal Vite HMR while `/json`, `/ws`, `/api/emulator/*`, and the vendored WLED UI remain available on the same origin.

`npm start` runs `server.ts` without Vite and serves the built emulator from `dist/emulator/`. Run `npm run build` before using `npm start` for a production-style session.

Useful checks after refactors:

```sh
npm run typecheck
npm run audit:native
npm run build
node --check tools/run-cpp-effect.mjs
node tools/generate-upstream-fx.mjs
c++ -std=c++17 -O2 -Icpp_harness cpp_harness/main.cpp cpp_harness/custom_effect.cpp cpp_harness/edc_usermod.cpp cpp_harness/wled_compat.cpp cpp_harness/wled_audio_bridge.cpp cpp_harness/generated/upstream_fx_1d.cpp -o /tmp/edc-wled-cpp-effect
```

## Change Checklist

Every future code change should include a quick docs check:

- Update `docs/architecture.md` when modules, ownership boundaries, generated artifacts, runtime flow, or data contracts change.
- Update `docs/cpp-harness.md` when native effect coverage, WLED compatibility shims, custom-effect workflow, audio data, or compile/run commands change.
- Update `docs/audio-reference-implementations.md` when changing which external audio-sync implementations inform the emulator's FFT, gain, beat, or packet semantics.
- Update `docs/wled-protocol.md` when `/json`, WebSocket, presets, effect catalog, segment behavior, or app/UI compatibility changes.
- Update `docs/fixture.md` when ring geometry, segment defaults, or LED counts change.
- Update `docs/custom-effects.md` when the user-facing custom effect workflow changes.
- Update this file when development commands, verification steps, or repo hygiene rules change.

If no docs need edits, still verify the relevant docs are correct before finishing the change.

## Generated Files

`tools/generate-upstream-fx.mjs` owns everything in `cpp_harness/generated/`. The server consumes `cpp_harness/generated/upstream_fx_1d_modes.json` as a stable support manifest; it should not scrape generated C++ headers or source files.

## Active Routes

The main active entry points are:

- WLED UI: `http://localhost:5173/`
- Emulator UI: `http://localhost:5173/emulator`
- Persistent audio capture: `http://localhost:5173/emulator/audio-capture.html`
- Lightweight liveview: `http://localhost:5173/liveview`

The old standalone custom-effect prototype is intentionally kept in `legacy/standalone-prototype/` and is not served by `server.ts`.

## Refactor Boundaries

Prefer keeping WLED protocol behavior in `src/server/`, Vite development wiring in `src/server/vite-plugin.ts`, virtual-output UI behavior and CSS in `src/emulator/`, static emulator HTML shells in `public/emulator/`, native effect work in `cpp_harness/`, generated native artifacts in `cpp_harness/generated/`, automation/bridge scripts in `tools/`, downloaded/local work artifacts in gitignored `artifacts/` subfolders, and architectural explanations in `docs/`.
