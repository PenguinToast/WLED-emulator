# Development Notes

## Commands

```sh
npm run dev
npm start
npm run cpp:run
```

`npm run dev` starts the TypeScript server through `tsx watch` and enables Vite middleware for browser hot reload. `npm start` runs the same TypeScript entrypoint without watch mode.

Useful checks after refactors:

```sh
npm run typecheck
npm run build
node --check public/emulator/main.js
node tools/generate-upstream-fx.mjs
c++ -std=c++17 -O2 -Icpp_harness cpp_harness/main.cpp cpp_harness/custom_effect.cpp cpp_harness/wled_compat.cpp cpp_harness/generated/upstream_fx_1d.cpp -o /tmp/edc-wled-cpp-effect
```

## Change Checklist

Every future code change should include a quick docs check:

- Update `docs/architecture.md` when modules, ownership boundaries, generated artifacts, runtime flow, or data contracts change.
- Update `docs/cpp-harness.md` when native effect coverage, WLED compatibility shims, custom-effect workflow, audio data, or compile/run commands change.
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
- Lightweight liveview: `http://localhost:5173/liveview`

The old standalone custom-effect prototype is intentionally kept in `legacy/standalone-prototype/` and is not served by `server.ts`.

## Refactor Boundaries

Prefer keeping WLED protocol behavior in `src/server/`, development server wiring in `src/server/dev.ts`, virtual-output UI behavior in `public/emulator/js/`, native effect work in `cpp_harness/`, generated native artifacts in `cpp_harness/generated/`, automation/bridge scripts in `tools/`, and architectural explanations in `docs/`.
