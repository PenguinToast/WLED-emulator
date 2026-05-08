# Audio Input

The emulator browser app analyzes audio with the Web Audio API and streams normalized bands over `/api/emulator/frames` as typed `audio` WebSocket messages. `POST /api/emulator/audio` remains available as an HTTP fallback and inspection path. The C++ harness reads that server audio state and exposes it through the WLED audio-reactive compatibility globals and `UsermodManager::getUMData()`.

## Sources

- `Mic`: captures microphone input with browser echo cancellation, noise suppression, and automatic gain disabled.
- `Computer`: captures audio from the browser's screen/share picker through `navigator.mediaDevices.getDisplayMedia()`. Browser support varies: Chrome can usually capture audio from a shared tab, and some browser/OS combinations expose system audio. On macOS, native app output such as the Spotify desktop app may require playing Spotify in a browser tab or routing output through a virtual loopback device.
- `File`: plays a local audio file through the hidden audio element and analyzes the same playback stream.

All sources feed the same analyzer, so WLED audio-reactive effects receive the same normalized fields regardless of input source:

- volume
- bass
- mid
- treble
- beat
- BPM estimate
- major peak frequency
- major peak magnitude
- 16 analyzer bins, shown in the emulator FFT visualizer below the LED preview

The browser streams this audio state once per animation frame, typically around 60 times per second, on the same WebSocket used for native RGB frames. The 16 FFT bins are shaped to match WLED audio-reactive `fftResult` as closely as the browser analyzer allows: the emulator maps browser FFT data into WLED's 22.05 kHz, 512-sample GEQ ranges, applies WLED's pink-noise compensation table, default manual gain, rise/fall smoothing, and square-root `FFTScalingMode = 3`. The C++ runner receives those already-scaled `fftResult` values from the frame bus and only falls back to `GET /api/emulator/audio` when the WebSocket is unavailable.

## WLED FFT Shape

WLED's audio-reactive usermod computes a 512-sample FFT at 22.05 kHz, zeros DC, applies a flat-top window, computes magnitudes, and exposes the strongest raw peak as `FFT_MajorPeak`/`FFT_Magnitude`. It then averages raw FFT bins into 16 fixed GEQ bands:

| GEQ bin | WLED raw bins | Approx range |
| --- | --- | --- |
| 0 | 1-2 | 43-86 Hz |
| 1 | 2-3 | 86-129 Hz |
| 2 | 3-5 | 129-216 Hz |
| 3 | 5-7 | 216-301 Hz |
| 4 | 7-10 | 301-430 Hz |
| 5 | 10-13 | 430-560 Hz |
| 6 | 13-19 | 560-818 Hz |
| 7 | 19-26 | 818-1120 Hz |
| 8 | 26-33 | 1120-1421 Hz |
| 9 | 33-44 | 1421-1895 Hz |
| 10 | 44-56 | 1895-2412 Hz |
| 11 | 56-70 | 2412-3015 Hz |
| 12 | 70-86 | 3015-3704 Hz |
| 13 | 86-104 | 3704-4479 Hz |
| 14 | 104-165 | 4479-7106 Hz, damped by 0.88 |
| 15 | 165-215 | 7106-9259 Hz, damped by 0.70 |

The emulator preserves that fixed-band shape instead of using generic log-spaced bins. Because Web Audio exposes byte magnitudes rather than WLED's raw `arduinoFFT` magnitudes, `WLED_ANALYZER_GAIN` is the single calibration constant that maps browser magnitudes into WLED's post-processing range.

## Browser Capture Notes

The Computer source requests a display capture with audio enabled, immediately stops the video track, and keeps the returned audio track. If the selected share target does not provide audio, the emulator stops the capture and reports that no shared audio track was provided.
