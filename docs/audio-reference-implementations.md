# Audio Reference Implementations

The emulator's audio path is informed by WLED's embedded audio-reactive usermod and a few public PC audio-sync senders. The references are useful for different reasons, so we intentionally do not copy any one implementation wholesale.

## WLED Embedded Audio-Reactive

Vendored WLED `v0.15.4` remains the parity target for custom effects. Its audio-reactive usermod exposes `volumeRaw`, `volumeSmth`, `samplePeak`, `fftResult[16]`, `FFT_MajorPeak`, and magnitude fields that upstream `FX.cpp` effects consume through `UsermodManager::getUMData()`.

For microphone input, the emulator keeps WLED's fixed 16-bin GEQ shape:

- raw FFT bins `1-2`, `2-3`, `3-5`, `5-7`, `7-10`, `10-13`, `13-19`, `19-26`, `26-33`, `33-44`, `44-56`, `56-70`, `70-86`, `86-104`, `104-165`, `165-215`
- high-bin damping on the last two bands
- pink-noise compensation
- square-root-style output scaling

Use this path when the real target is an ESP32 running WLED with a microphone or another source that should behave like WLED's embedded analyzer.

## Victoare/SR-WLED-audio-server-win

This is the strongest reference for computer-output audio sync. It captures Windows audio with NAudio, accumulates 2048 samples with a 1024-sample slide, applies a flat-top FFT window, computes FFT magnitudes, buckets the result into 16 configurable frequency bands, applies square-root value scaling, normalizes with rolling gain control, and emits WLED audio-sync v2 packets.

Useful behaviors for the emulator:

- direct PC audio is treated differently from an embedded mic
- logarithmic 40 Hz to 10 kHz bands are a practical default for mastered music
- max-per-bucket energy preserves kick/bass hits better than broad low-band averaging
- rolling AGC adapts to quiet and loud tracks without pinning the analyzer permanently
- beat detection compares low-frequency max energy against a rolling history

This is the default model for emulator File and Computer audio sources.

## zak-45/WLEDAudioSync-Chataigne-Module

This Chataigne module is most useful as a cross-check for WLED bin geometry and packet layout. Its comments include both the older SR bin layout and the newer WLED GEQ ranges, matching the embedded WLED bins above. It also sends both v1 and v2 audio-sync packet formats.

The module delegates most real analysis to Chataigne's Sound Card module and optional aubio BPM tooling, then multiplies Chataigne's analyzer outputs into WLED packet fields. Because those upstream analyzer semantics are Chataigne-specific, this is not the best standalone FFT model for the emulator. It does confirm that WLED GEQ-shaped bins are the right compatibility target when custom effects are expected to transfer to real WLED builds.

## chrisgott/feed_my_wled

This script is useful as a compact example of the WLED audio-sync v2 packet idea, but not as an FFT model for us. It reads raw audio from stdin and creates a v2 packet, but the FFT code normalizes the whole spectrum and sends only the first 16 raw FFT bins. At common sample rates and buffer sizes, those bins cover only the lowest part of the spectrum and do not map to WLED's 16 GEQ bands. The current script also calls its FFT helper without the required `sample_rate` argument.

Do not use this as the emulator's analyzer reference.

## Beat and Onset References

The EDC effect is not trying to embed a full music-information-retrieval library in WLED, but the detector borrows the shape of proven open-source beat trackers:

- [aubio](https://github.com/aubio/aubio) is a C audio-analysis library with onset methods, tempo tracking, beat detection, FFT, and filters. Its project page also emphasizes causal operation for low-latency real-time use, which matches the firmware constraint better than offline-only analysis.
- [BTrack](https://github.com/adamstark/BTrack) is a real-time C++ beat tracker. It can process either raw audio frames or precomputed onset-detection-function samples, then reports whether a beat is due in the current frame. That split validates our local architecture: browser/emulator audio analysis feeds compact WLED-style bands, and the usermod tracks onset/tempo from those values.
- [Essentia RhythmExtractor2013](https://essentia.upf.edu/reference/streaming_RhythmExtractor2013.html) is useful as an offline quality reference because it reports beat ticks, BPM, confidence, BPM estimates, and beat intervals using multifeature or Degara beat trackers. Essentia's tutorial explicitly notes that RhythmExtractor2013 relies on whole-track statistics and is not suited for real-time detection, so we should use its ideas and test methodology rather than porting it into the effect.
- Essentia's rhythm tutorial also highlights BPM histograms and loop-specific BPM estimation. For our evaluator, that supports scoring against a stable beat grid with a confidence flag instead of treating every bass transient as ground truth.

Practical takeaways for the ESP32-S3 usermod:

- Detect positive onset flux against a smoothed baseline instead of raw low-bin loudness.
- Maintain adaptive onset floors from both average and peak behavior so drops with a higher noise floor do not permanently saturate the detector.
- Separate kick, snare, and hat evidence by band shape, then let only the kick train the primary tempo/phase model.
- Keep a tempo candidate and phase window so repeated offbeat/subdivision hits must prove themselves before they can move the main beat grid.
- Allow on-grid rescue hits during dense drops, but do not let rescue hits reinforce confidence as strongly as normal detections.

## Emulator Choice

The emulator uses a two-profile strategy:

- `mic`: WLED embedded analyzer parity, for custom-effect development against real WLED microphone behavior.
- `direct`: PC audio-sync behavior modeled after SR-WLED, for File and Computer audio where mastered digital output needs usable bass response, AGC, and beat detection.

Both profiles still emit the same normalized emulator payload shape. The C++ harness maps that payload into WLED's `um_data_t`, so custom C++ effects keep using the same `fftResult[16]`, `samplePeak`, `FFT_MajorPeak`, and magnitude fields they would use in a real WLED build.
