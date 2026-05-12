# Firmware Build

The firmware path uses WLED v16 as a git submodule at `vendor/WLED`. That is the right shape for this repo: WLED stays an upstream dependency pinned to a known tag, while our emulator, host shims, and EDC usermod stay in the main project.

This project uses `mise` for the firmware toolchain. `.mise.toml` pins Node and Python so WLED's UI build and v16 PlatformIO scripts run consistently.

## Usermod Layout

`usermods/edc_dance` is an external WLED v16 usermod library:

- `edc_dance.cpp`: `Usermod` subclass, persistent config, and `EDC Custom` effect registration.
- `library.json`: PlatformIO library metadata with `"build": { "libArchive": false }`, which WLED v16 requires for custom usermod libraries.
- `readme.md`: standalone inclusion notes.

The usermod registers the effect in `setup()` with:

```cpp
strip.addEffect(255, &mode_edc_custom, _data_FX_MODE_EDC_CUSTOM);
```

The `255` request lets WLED assign the first available user effect slot. The emulator mirrors that by placing `EDC Custom` at ID `220`, immediately after the WLED v16 built-in `MODE_COUNT`.

## Commands

Initialize or update the WLED submodule after cloning:

```sh
git submodule update --init --recursive
mise trust
mise install
mise exec -- python -m pip install --user platformio
```

Prepare a build tree without compiling:

```sh
mise exec -- npm run firmware:prepare
```

Build the default ESP32-S3 firmware target:

```sh
mise exec -- npm run firmware:build
```

Flash a connected board:

```sh
mise exec -- npm run firmware:flash -- --upload-port /dev/cu.usbserial-0001
```

## Build Harness

`tools/wled-firmware.mjs` stages WLED into `artifacts/firmware/WLED`, which is gitignored, then writes a generated `platformio_override.ini`:

```ini
[env:edc_esp32s3dev_8MB_qspi]
extends = env:esp32s3dev_8MB_qspi
custom_usermods =
  ${env:esp32s3dev_8MB_qspi.custom_usermods}
  edc_dance = symlink:///absolute/path/to/usermods/edc_dance
```

By default the harness builds `esp32s3dev_8MB_qspi`, which already includes WLED's `audioreactive` usermod in v16. Override these when needed:

- `WLED_ENV`: base WLED PlatformIO environment.
- `WLED_BUILD_ENV`: generated environment name.
- `WLED_SOURCE`: alternate WLED checkout.
- `WLED_FIRMWARE_STAGE`: alternate staging directory.
- `EDC_USERMOD_DIR`: alternate external usermod directory.
- `PLATFORMIO_CMD`: explicit `pio`/`platformio` binary.
- `UPLOAD_PORT`: serial port for flashing.

The staging step avoids editing files inside the WLED submodule. Future firmware changes should update `usermods/edc_dance`, the harness, or docs, then rebuild from a fresh stage.
