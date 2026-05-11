# Audio Input

The emulator browser app analyzes audio with the Web Audio API and streams normalized bands over `/api/emulator/frames` as typed `audio` WebSocket messages. `GET|POST /api/emulator/audio` remains available as an inspection and manual-injection path, but browser audio streaming is WebSocket-only so transport failures stay visible while developing audio-reactive effects. The C++ harness reads that server audio state and exposes it through the WLED audio-reactive compatibility globals and `UsermodManager::getUMData()`.

## Sources

- `Mic`: captures microphone input with browser echo cancellation, noise suppression, and automatic gain disabled.
- `Computer`: opens `/emulator/audio-capture.html`, a small capture window that requests audio from the browser's screen/share picker through `navigator.mediaDevices.getDisplayMedia()` and streams it to the same emulator bus. Keeping capture in a separate window lets shared audio continue across reloads of the main `/emulator` page. Browser support varies: Chrome can usually capture audio from a shared tab, and some browser/OS combinations expose system audio. On macOS, native app output such as the Spotify desktop app may require playing Spotify in a browser tab or routing output through a virtual loopback device.
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
- beat/sample-peak state, shown as a `Beat` badge and bass-side flash in the emulator FFT visualizer
- 16 analyzer bins, shown in the emulator FFT visualizer below the LED preview

The browser streams this audio state once per animation frame, typically around 60 times per second, on the same WebSocket used for native RGB frames. The stream reconnects with backoff after socket errors or dev-server restarts, and the UI displays an explicit audio stream error while the WebSocket is unavailable or backed up. Audio streaming intentionally does not fall back to HTTP, because that would hide transport failures while developing audio-reactive effects. `GET|POST /api/emulator/audio` remains available only as an inspection/manual-injection endpoint. Microphone input is shaped to match WLED audio-reactive `fftResult` as closely as the browser analyzer allows: the emulator resamples browser FFT data at WLED's 22.05 kHz, 512-sample raw FFT bin centers, averages those into WLED's GEQ ranges, applies default manual gain, rise/fall smoothing, and square-root `FFTScalingMode = 3`. Direct digital sources, meaning File and Computer audio, follow the PC sync style used by `Victoare/SR-WLED-audio-server-win`: logarithmic 40 Hz to 10 kHz buckets, average/peak blended bucket energy, per-bin rolling floor subtraction, rolling AGC, and beat detection from low-frequency history. The floor subtraction is intentionally stronger than a raw max-bucket sync sender because mastered computer audio often has a high broadband noise floor that otherwise pins the lower FFT bins. The C++ runner receives those already-scaled `fftResult` values from the frame bus and logs a warning rather than polling HTTP when the WebSocket is unavailable. The main emulator page also consumes inbound audio bus messages so the FFT visualizer and volume readouts show capture-window audio.

## Tuning Controls

The emulator exposes local audio tuning sliders directly below the FFT visualizer on `/emulator`. These settings are stored in browser `localStorage` and affect only the analyzer payload sent to the native runner:

- `Input gain`: scales time-domain volume and browser FFT magnitudes before WLED-shaped processing.
- `FFT gain`: scales the 16 WLED-shaped FFT bins without changing the volume readout as aggressively.
- `Noise gate`: suppresses quiet room noise and low-level FFT leakage before bins are smoothed.
- `Smoothing`: updates the release speed of the WLED-shaped FFT bins. Browser analyzer smoothing stays disabled so short kick and bass transients reach the WLED-style post-processing path.

For microphone testing, lower `Input gain` first if the FFT bars sit near `1.00` while the room is only moderately loud. Lower `FFT gain` if volume looks reasonable but audio-reactive effects still pin every bin.

## FFT Shapes

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

The emulator preserves that fixed-band shape for microphone input, where the goal is parity with WLED's embedded audio-reactive path. Because Web Audio exposes byte magnitudes rather than WLED's raw `arduinoFFT` magnitudes, mic analyzer gain is calibrated below the embedded default so browser/OS mic pre-amplification does not immediately saturate every bin.

Direct digital audio instead models a PC audio-sync sender. The emulator uses 16 logarithmic buckets from 40 Hz to 10 kHz, stores the maximum magnitude in each bucket, square-root scales the values, normalizes them with a rolling automatic gain span, and smooths display/output release with the local `Smoothing` slider. This gives mastered browser/system output the same kind of WLED UDP-sync payload shape as the reference SR-WLED Windows server. See `docs/audio-reference-implementations.md` for the comparison against other public senders.

Bass transients also drive the payload `beat` flag used as WLED's `samplePeak` shim. Effects such as `Ripple Peak` depend on that flag to spawn new ripples. Mic input keeps the low-frequency-peak plus transient detector. Direct digital audio follows the SR-WLED server approach: compare the current 100-500 Hz max against a rolling history and trigger when it crosses a robust local threshold. The direct detector also keeps a light tempo lock and tempo-aware refractory window so mastered drops with a high noise floor can keep emitting one beat per musical kick instead of going silent or firing several times per beat.

## Browser Capture Notes

The Computer source requests a display capture with audio enabled, immediately stops the video track, and keeps the returned audio track. If the selected share target does not provide audio, the emulator stops the capture and reports that no shared audio track was provided.
