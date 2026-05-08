# Audio Input

The emulator browser app analyzes audio with the Web Audio API and posts normalized bands to `POST /api/emulator/audio`. The C++ harness reads that server audio state and exposes it through the WLED audio-reactive compatibility globals and `UsermodManager::getUMData()`.

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
- 16 analyzer bins

The browser posts this audio state around 20 times per second. The C++ runner fetches `/api/emulator/audio` separately from full WLED state so native audio-reactive effects can react without waiting on the larger state/catalog payload.

## Browser Capture Notes

The Computer source requests a display capture with audio enabled, immediately stops the video track, and keeps the returned audio track. If the selected share target does not provide audio, the emulator stops the capture and reports that no shared audio track was provided.
