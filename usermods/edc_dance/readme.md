# EDC Dance Usermod

`edc_dance` is a WLED v16 usermod library. It registers the `EDC Custom` effect through WLED's usermod framework using `REGISTER_USERMOD(...)` and `strip.addEffect(255, ...)`.

Build it by adding the library to a PlatformIO environment's `custom_usermods` list:

```ini
custom_usermods =
  ${env:esp32s3dev_8MB_qspi.custom_usermods}
  symlink:///absolute/path/to/edc/usermods/edc_dance
```

The effect expects the WLED AudioReactive usermod to be present and reads the normal `UsermodManager::getUMData(..., USERMOD_ID_AUDIOREACTIVE)` fields:

- `volumeSmth`
- `fftResult[16]`
- `samplePeak`

The static settings appear under WLED's Usermod settings page as `EDC Dance`. Live feel remains controlled by the normal effect sliders:

- `Speed`
- `Beat Focus`
- `Tightness`
- `Impact`
- `Accent Mix`
