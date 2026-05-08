# WLED Protocol Surface

The active server exposes enough of the WLED HTTP JSON and WebSocket API for the real WLED browser UI and app to control the virtual fixture.

## WLED Endpoints

- `GET /`: vendored WLED `index.htm`.
- `GET /index.css`, `/index.js`, `/iro.js`, `/rangetouch.js`: vendored WLED UI assets.
- `GET|POST /json`: full WLED JSON payload.
- `GET|POST /json/si`: state and info payload.
- `GET|POST /json/state`: state only.
- `GET /json/info`: device info only.
- `GET /json/effects` and `/json/eff`: effect names parsed from vendored WLED `v0.15.4`.
- `GET /json/fxdata`: effect metadata strings parsed from vendored WLED `v0.15.4`.
- `GET /json/palettes` and `/json/pal`: emulator palette names.
- `GET /json/palx`: emulator palette RGB data.
- `GET /json/live`: small WLED-style live preview payload.
- `GET /presets.json`: minimal preset list.
- `GET /ws`: raw WebSocket endpoint for WLED UI state updates.

## Emulator Endpoints

- `GET /emulator`: virtual LED output with audio input and custom-effect editor.
- `GET /liveview` and `/liveview2D`: lightweight WLED liveview-compatible ring preview.
- `GET /api/emulator/state`: combined state, info, effect catalog, palette data, audio state, fixture metadata, and latest external frame.
- `POST /api/emulator/audio`: normalized audio state from the browser.
- `POST /api/emulator/frame`: RGB frame stream from native or other external renderers.

## State Updates

The server accepts WLED-style state patches. When `seg` is an array, patches are merged into matching segment IDs. When `seg` is an object, the patch is applied to every selected segment, matching how the WLED UI commonly edits multiple segments.

