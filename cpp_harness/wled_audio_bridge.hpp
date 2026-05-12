#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#define USERMOD_ID_AUDIOREACTIVE 42

struct AudioData {
  float volume = 0.0f;
  float bass = 0.0f;
  float mid = 0.0f;
  float treble = 0.0f;
  bool beat = false;
  float bpm = 0.0f;
  float majorPeak = 0.0f;
  float magnitude = 0.0f;
  std::array<float, 16> bins = {};
};

enum um_types_t {
  UMT_BYTE = 0,
  UMT_UINT16,
  UMT_INT16,
  UMT_UINT32,
  UMT_INT32,
  UMT_FLOAT,
  UMT_DOUBLE,
  UMT_BYTE_ARR,
  UMT_UINT16_ARR,
  UMT_INT16_ARR,
  UMT_UINT32_ARR,
  UMT_INT32_ARR,
  UMT_FLOAT_ARR,
  UMT_DOUBLE_ARR
};

struct um_data_t {
  size_t u_size = 0;
  um_types_t* u_type = nullptr;
  void** u_data = nullptr;
};

extern AudioData audioData;
extern float volumeSmth;
extern uint16_t volumeRaw;
extern float FFT_MajorPeak;
extern float my_magnitude;
extern bool samplePeak;
extern uint8_t fftResult[16];
extern uint8_t maxVol;
extern uint8_t binNum;

class UsermodManager {
 public:
  static bool getUMData(um_data_t** umData, uint8_t modId = USERMOD_ID_AUDIOREACTIVE);
};

um_data_t* simulateSound(uint8_t simulationId);
void prepareAudioReactiveFrame(const AudioData& audio);
