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
- 16 analyzer bins, shown in the emulator FFT visualizer below the LED preview

The browser streams this audio state once per animation frame, typically around 60 times per second, on the same WebSocket used for native RGB frames. The 16 FFT bins are log-spaced from about 60 Hz to 11 kHz and use mild high-frequency compensation so normal music does not collapse into the lowest bands. The C++ runner receives those audio messages from the frame bus and only falls back to `GET /api/emulator/audio` when the WebSocket is unavailable.

## Browser Capture Notes

The Computer source requests a display capture with audio enabled, immediately stops the video track, and keeps the returned audio track. If the selected share target does not provide audio, the emulator stops the capture and reports that no shared audio track was provided.
