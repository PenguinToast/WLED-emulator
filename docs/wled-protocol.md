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
- `GET /edit?edit=/version-info.json`: minimal version-info file used by the WLED UI install/upgrade prompt.
- `POST /upload`: accepts WLED UI multipart uploads for `version-info.json`.
- `GET /settings`: minimal settings index with a Usermod Settings link.
- `GET /settings/um` and `/settings/um.htm`: emulator Usermod Settings page for the `EDC Dance` usermod.
- `GET /ws`: raw WebSocket endpoint for WLED UI state updates.

## Emulator Endpoints

- `GET /emulator`: virtual LED output with mic, file audio input, persistent computer/share capture launcher, and native-frame display.
- `GET /emulator/audio-capture.html`: detached mic/computer audio capture window that streams typed audio payloads to `/api/emulator/frames`.
- `GET /liveview` and `/liveview2D`: lightweight WLED liveview-compatible ring preview.
- `GET /api/emulator/state`: combined state, info, effect catalog, palette data, audio state, fixture metadata, and latest external frame.
- `GET|POST /api/emulator/audio`: latest normalized audio state, including volume bands, beat/BPM, major peak frequency, major peak magnitude, source profile, and 16 WLED-shaped analyzer bins. This endpoint is for inspection and manual injection only; browser audio streaming uses `/api/emulator/frames` and surfaces WebSocket errors instead of falling back to HTTP.
- `GET|POST /api/emulator/frame`: latest native RGB frame from native or other external renderers. This endpoint remains as an HTTP fallback and inspection endpoint.
- `GET /api/emulator/frames`: typed emulator WebSocket bus. Browser clients send `audio` messages here, the C++ runner receives them and sends compact `frame` RGB hex messages back, and the emulator UI consumes the frame messages directly. The server handles WebSocket close/ping/pong control frames, bounds partial-frame buffering, does not echo high-rate audio or frame messages back to the socket that sent them, and ignores older still-running frame streams from the same source once a newer stream is active.
- `GET|POST /api/usermods/edc`: persistent config for the `EDC Dance` usermod plus preset defaults. The C++ runner reads this config from `/api/emulator/state` and sends it into the native harness before segment rendering.

WLED segment state preserves the standard effect controls `sx`, `ix`, `c1`, `c2`, `c3`, `o1`, `o2`, `o3`, `si`, and `m12`. When the WLED UI sends `fxdef: true` while changing `fx`, the emulator applies the same effect-default fields encoded in upstream `FX.cpp`, including resets to default speed/intensity/custom sliders and effect-specific defaults such as `m12=2,si=0`. Native effect rendering maps `c1`/`c2`/`c3` to `SEGMENT.custom1`/`custom2`/`custom3`, so audio-reactive controls such as Freqwave's Low bin, High bin, and Pre-amp sliders carry into the C++ shim.

## State Updates

The server accepts WLED-style state patches. When `seg` is an array, patches are merged into matching segment IDs. When `seg` is an object, the patch is applied to every selected segment, matching how the WLED UI commonly edits multiple segments.

Segment color updates are slot-aware. The WLED UI sends partial color arrays such as `col:[[],[r,g,b,w],[]]` when only one slot changes; empty slot arrays preserve the existing color instead of replacing it with black.

`info.leds.seglc` is exposed as WLED's per-segment light-capability bitfield, not segment length. The ring fixture reports RGB capability (`0x01`) for each segment; ring lengths live in `info.fixture` and `/api/emulator/state.fixture`.

The effect list includes `EDC Custom` as a usermod-registered effect slot. The emulator assigns it ID `187`, matching the native harness' first available slot after the exposed WLED `v0.15.4` catalog, while the usermod registration metadata records that the real WLED request would be `strip.addEffect(255, ...)`.

## Version Info

The WLED UI probes `/edit?edit=/version-info.json` on load. The emulator serves a current version-info document by default so the first-install reporting modal does not appear every time the UI opens. If the UI uploads a new `version-info.json` through `/upload`, the emulator stores that choice in `.edc-emulator/version-info.json`, which is ignored by git and survives dev-server restarts.
