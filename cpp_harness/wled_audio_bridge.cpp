#include "wled_effect_harness.hpp"

AudioData audioData;
float volumeSmth = 0.0f;
uint16_t volumeRaw = 0;
float FFT_MajorPeak = 0.0f;
float my_magnitude = 0.0f;
bool samplePeak = false;
uint8_t fftResult[16] = {};
uint8_t maxVol = 31;
uint8_t binNum = 8;

namespace {
um_types_t audioTypes[8] = {
  UMT_FLOAT,
  UMT_UINT16,
  UMT_BYTE_ARR,
  UMT_BYTE,
  UMT_FLOAT,
  UMT_FLOAT,
  UMT_BYTE,
  UMT_BYTE,
};

void* audioValues[8] = {
  &volumeSmth,
  &volumeRaw,
  fftResult,
  &samplePeak,
  &FFT_MajorPeak,
  &my_magnitude,
  &maxVol,
  &binNum,
};

um_data_t hostAudioData{8, audioTypes, audioValues};
}

bool UsermodManager::getUMData(um_data_t** umData, uint8_t modId) {
  if (modId != USERMOD_ID_AUDIOREACTIVE) return false;
  if (umData) *umData = &hostAudioData;
  return true;
}

um_data_t* simulateSound(uint8_t) {
  return &hostAudioData;
}

void prepareAudioReactiveFrame(const AudioData& audio) {
  audioData = audio;
  const float weightedVolume = std::max(audio.volume, std::max(audio.bass, std::max(audio.mid, audio.treble)) * 0.82f);
  const float agcVolume = std::sqrt(constrain(weightedVolume, 0.0f, 1.0f)) * 255.0f;
  volumeSmth = constrain(agcVolume, 0.0f, 255.0f);
  volumeRaw = uint16_t(constrain(audio.volume * 512.0f, 0.0f, 65535.0f));
  samplePeak = audio.beat;
  FFT_MajorPeak = std::max(1.0f, audio.majorPeak > 0.0f ? audio.majorPeak : 1.0f);
  my_magnitude = constrain(audio.magnitude * 1024.0f, 0.001f, 1024.0f);
  for (uint8_t i = 0; i < 16; i += 1) {
    const float bin = constrain(audio.bins[i], 0.0f, 1.0f);
    fftResult[i] = clamp8(bin * 255.0f);
  }
}
