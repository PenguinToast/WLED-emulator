# Development Notes

## Commands

```sh
npm start
npm run cpp:run
```

Useful checks after refactors:

```sh
node --check server.mjs
node --check src/server/http.mjs
node --check public/emulator/main.js
node tools/generate-upstream-fx.mjs
c++ -std=c++17 -O2 -Icpp_harness cpp_harness/main.cpp cpp_harness/custom_effect.cpp cpp_harness/wled_compat.cpp cpp_harness/generated/upstream_fx_1d.cpp -o /tmp/edc-wled-cpp-effect
```

## Active Routes

The main active entry points are:

- WLED UI: `http://localhost:5173/`
- Emulator UI: `http://localhost:5173/emulator`
- Lightweight liveview: `http://localhost:5173/liveview`

The old standalone custom-effect prototype is intentionally kept in `legacy/standalone-prototype/` and is not served by `server.mjs`.

## Refactor Boundaries

Prefer keeping WLED protocol behavior in `src/server/`, virtual-output UI behavior in `public/emulator/js/`, native effect work in `cpp_harness/`, automation/bridge scripts in `tools/`, and architectural explanations in `docs/`.
