#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <initializer_list>
#include <type_traits>
#include <vector>

using byte = uint8_t;
using fract8 = uint8_t;

#ifndef MIN
#define MIN(a,b) ((a)<(b)?(a):(b))
#endif
#ifndef MAX
#define MAX(a,b) ((a)>(b)?(a):(b))
#endif
#ifndef RGBW32
#define RGBW32(r,g,b,w) (uint32_t((byte(w) << 24) | (byte(r) << 16) | (byte(g) << 8) | byte(b)))
#endif

#define RED        (uint32_t)0xFF0000
#define GREEN      (uint32_t)0x00FF00
#define BLUE       (uint32_t)0x0000FF
#define WHITE      (uint32_t)0xFFFFFF
#define BLACK      (uint32_t)0x000000
#define YELLOW     (uint32_t)0xFFFF00
#define CYAN       (uint32_t)0x00FFFF
#define MAGENTA    (uint32_t)0xFF00FF
#define PURPLE     (uint32_t)0x400080
#define ORANGE     (uint32_t)0xFF3000
#define PINK       (uint32_t)0xFF1493
#define GREY       (uint32_t)0x808080
#define GRAY       GREY
#define ULTRAWHITE (uint32_t)0xFFFFFFFF
#define bitRead(value, bit) (((value) >> (bit)) & 0x01)
#define bitWrite(value, bit, bitvalue) ((bitvalue) ? ((value) |= (1UL << (bit))) : ((value) &= ~(1UL << (bit))))

#define WLED_FPS 42
#define FRAMETIME_FIXED (1000 / WLED_FPS)
#define FRAMETIME strip.getFrameTime()
#define NUM_COLORS 3
#define FX_MODE_EDC_CUSTOM 187
#define SPEED_FORMULA_L (5U + (50U * (255U - SEGMENT.speed)) / std::max<uint16_t>(1, SEGLEN))
#define M_TWOPI (2.0 * 3.14159265358979323846)
#define NOBLEND 0
#define LINEARBLEND 1
#define FAIR_DATA_PER_SEG 2048
#define USERMOD_ID_AUDIOREACTIVE 42

using std::max;
using std::min;

uint32_t millis();
uint32_t micros();

struct CHSV {
  uint8_t h = 0;
  uint8_t s = 0;
  uint8_t v = 0;
  CHSV() = default;
  CHSV(uint8_t hue, uint8_t sat, uint8_t val) : h(hue), s(sat), v(val) {}
};

struct CRGB {
  union {
    struct { uint8_t r; uint8_t g; uint8_t b; };
    struct { uint8_t red; uint8_t green; uint8_t blue; };
  };

  CRGB() : r(0), g(0), b(0) {}
  CRGB(uint8_t red, uint8_t green, uint8_t blue) : r(red), g(green), b(blue) {}
  CRGB(uint32_t color) : r((color >> 16) & 0xff), g((color >> 8) & 0xff), b(color & 0xff) {}
  CRGB(const CHSV& hsv);
  CRGB& operator=(uint32_t color) {
    r = (color >> 16) & 0xff;
    g = (color >> 8) & 0xff;
    b = color & 0xff;
    return *this;
  }
  bool operator==(const CRGB& other) const { return r == other.r && g == other.g && b == other.b; }
  bool operator!=(const CRGB& other) const { return !(*this == other); }
  uint8_t& operator[](size_t index) { return index == 0 ? r : (index == 1 ? g : b); }
  const uint8_t& operator[](size_t index) const { return index == 0 ? r : (index == 1 ? g : b); }
  explicit operator uint32_t() const { return (uint32_t(r) << 16) | (uint32_t(g) << 8) | uint32_t(b); }

  static const CRGB Black;
  static const CRGB White;
  static const CRGB Red;
  static const CRGB Green;
  static const CRGB Blue;
  static const CRGB Gray;
  static const CRGB Orange;
  static const CRGB DarkOrange;
  static const CRGB Yellow;

  CRGB& operator|=(const CRGB& other) {
    r = std::max(r, other.r);
    g = std::max(g, other.g);
    b = std::max(b, other.b);
    return *this;
  }
  CRGB& operator|=(const CHSV& other) {
    return *this |= CRGB(other);
  }
  CRGB& operator+=(const CRGB& other) {
    r = std::min(255, r + other.r);
    g = std::min(255, g + other.g);
    b = std::min(255, b + other.b);
    return *this;
  }
  CRGB operator+(const CRGB& other) const {
    CRGB copy = *this;
    copy += other;
    return copy;
  }
  CRGB& nscale8(uint8_t scale) {
    r = r * scale / 255;
    g = g * scale / 255;
    b = b * scale / 255;
    return *this;
  }
  CRGB& nscale8_video(uint8_t scale) {
    r = ((uint16_t(r) * scale) >> 8) + (r && scale ? 1 : 0);
    g = ((uint16_t(g) * scale) >> 8) + (g && scale ? 1 : 0);
    b = ((uint16_t(b) * scale) >> 8) + (b && scale ? 1 : 0);
    return *this;
  }
  uint8_t getAverageLight() const { return (uint16_t(r) + g + b) / 3; }
  explicit operator bool() const { return r || g || b; }
  CRGB fadeToBlackBy(uint8_t fade) const {
    CRGB copy = *this;
    copy.nscale8(255 - fade);
    return copy;
  }
};

struct CRGBPalette16 {
  CRGBPalette16() = default;
  CRGBPalette16(std::initializer_list<uint32_t>) {}
  template <typename... Args>
  explicit CRGBPalette16(Args...) {}
};
#define SEGPALETTE CRGBPalette16{}
inline void nblendPaletteTowardPalette(CRGBPalette16&, const CRGBPalette16&, uint8_t) {}

inline uint8_t clamp8(float value) {
  return static_cast<uint8_t>(std::max(0.0f, std::min(255.0f, value)));
}

inline uint8_t R(uint32_t color) { return (color >> 16) & 0xff; }
inline uint8_t G(uint32_t color) { return (color >> 8) & 0xff; }
inline uint8_t B(uint32_t color) { return color & 0xff; }
inline uint8_t W(uint32_t color) { return (color >> 24) & 0xff; }

inline uint32_t toRgbw(const CRGB& color) {
  return RGBW32(color.r, color.g, color.b, 0);
}

inline CRGB rgb(float r, float g, float b) {
  return {clamp8(r), clamp8(g), clamp8(b)};
}

inline CRGB hsv(float h, float s, float v) {
  h = std::fmod(std::fmod(h, 360.0f) + 360.0f, 360.0f);
  s = std::max(0.0f, std::min(1.0f, s));
  v = std::max(0.0f, std::min(1.0f, v));
  const float c = v * s;
  const float x = c * (1.0f - std::fabs(std::fmod(h / 60.0f, 2.0f) - 1.0f));
  const float m = v - c;
  float r = 0.0f;
  float g = 0.0f;
  float b = 0.0f;
  if (h < 60.0f) { r = c; g = x; }
  else if (h < 120.0f) { r = x; g = c; }
  else if (h < 180.0f) { g = c; b = x; }
  else if (h < 240.0f) { g = x; b = c; }
  else if (h < 300.0f) { r = x; b = c; }
  else { r = c; b = x; }
  return rgb((r + m) * 255.0f, (g + m) * 255.0f, (b + m) * 255.0f);
}

inline CRGB::CRGB(const CHSV& color) : CRGB(hsv(color.h * 360.0f / 255.0f, color.s / 255.0f, color.v / 255.0f)) {}
inline const CRGB CRGB::Black = CRGB(0, 0, 0);
inline const CRGB CRGB::White = CRGB(255, 255, 255);
inline const CRGB CRGB::Red = CRGB(255, 0, 0);
inline const CRGB CRGB::Green = CRGB(0, 255, 0);
inline const CRGB CRGB::Blue = CRGB(0, 0, 255);
inline const CRGB CRGB::Gray = CRGB(128, 128, 128);
inline const CRGB CRGB::Orange = CRGB(255, 165, 0);
inline const CRGB CRGB::DarkOrange = CRGB(255, 80, 0);
inline const CRGB CRGB::Yellow = CRGB(255, 255, 0);

inline uint32_t color_blend(uint32_t color1, uint32_t color2, uint16_t blend, bool b16 = false) {
  const uint32_t scale = b16 ? 65535U : 255U;
  blend = std::min<uint32_t>(blend, scale);
  const uint32_t keep = scale - blend;
  return RGBW32(
    (R(color1) * keep + R(color2) * blend) / scale,
    (G(color1) * keep + G(color2) * blend) / scale,
    (B(color1) * keep + B(color2) * blend) / scale,
    (W(color1) * keep + W(color2) * blend) / scale
  );
}

inline uint32_t color_add(uint32_t color1, uint32_t color2, bool = false) {
  return RGBW32(
    std::min(255, R(color1) + R(color2)),
    std::min(255, G(color1) + G(color2)),
    std::min(255, B(color1) + B(color2)),
    std::min(255, W(color1) + W(color2))
  );
}

inline uint32_t color_fade(uint32_t color, uint8_t brightness, bool = false) {
  return RGBW32(
    R(color) * brightness / 255,
    G(color) * brightness / 255,
    B(color) * brightness / 255,
    W(color) * brightness / 255
  );
}

inline uint8_t sin8_t(uint8_t theta) {
  return clamp8((std::sin(theta * 2.0f * 3.14159265f / 255.0f) + 1.0f) * 127.5f);
}

inline uint8_t cos8_t(uint8_t theta) {
  return clamp8((std::cos(theta * 2.0f * 3.14159265f / 255.0f) + 1.0f) * 127.5f);
}

inline uint8_t triwave8(uint8_t value) {
  return (value & 0x80) ? uint8_t((255 - value) * 2) : uint8_t(value * 2);
}

inline uint8_t cubicwave8(uint8_t value) {
  const float x = triwave8(value) / 255.0f;
  return clamp8((3.0f * x * x - 2.0f * x * x * x) * 255.0f);
}

inline uint8_t quadwave8(uint8_t value) {
  const float x = triwave8(value) / 255.0f;
  return clamp8(x * x * 255.0f);
}

inline int16_t sin16_t(uint16_t theta) {
  return static_cast<int16_t>(std::sin(theta * 2.0 * 3.141592653589793 / 65535.0) * 32767.0);
}

inline int16_t cos16_t(uint16_t theta) {
  return sin16_t(theta + 0x4000);
}

inline uint8_t gamma8(uint8_t value) {
  const float normalized = value / 255.0f;
  return clamp8(std::pow(normalized, 2.2f) * 255.0f);
}

inline float sin_t(float value) { return std::sin(value); }
inline float cos_t(float value) { return std::cos(value); }
inline uint8_t qadd8(uint8_t a, uint8_t b) { return std::min(255, a + b); }
inline uint8_t qsub8(uint8_t a, uint8_t b) { return a > b ? a - b : 0; }
inline uint8_t scale8(uint8_t value, uint8_t scale) { return (uint16_t(value) * scale) >> 8; }
inline uint16_t scale16(uint16_t value, uint16_t scale) { return (uint32_t(value) * scale) >> 16; }

inline uint8_t hash8(uint32_t x) {
  x ^= x >> 16;
  x *= 0x7feb352dU;
  x ^= x >> 15;
  x *= 0x846ca68bU;
  x ^= x >> 16;
  return x & 0xff;
}

inline uint8_t inoise8(uint32_t x, uint32_t y = 0, uint32_t z = 0) {
  return hash8(x * 374761393U + y * 668265263U + z * 2246822519U);
}

inline uint16_t inoise16(uint32_t x, uint32_t y = 0, uint32_t z = 0) {
  return (uint16_t(inoise8(x, y, z)) << 8) | inoise8(x + 17, y + 31, z + 47);
}

inline CRGB ColorFromPalette(const CRGBPalette16&, uint8_t index, uint8_t brightness = 255, uint8_t = 0) {
  CRGB color = hsv(index * 360.0f / 255.0f, 0.9f, brightness / 255.0f);
  return color;
}

inline long map(long x, long in_min, long in_max, long out_min, long out_max) {
  if (in_max == in_min) return out_min;
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

inline float mapf(float x, float in_min, float in_max, float out_min, float out_max) {
  if (in_max == in_min) return out_min;
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

template <typename T, typename U, typename V>
inline auto constrain(T value, U minValue, V maxValue) -> std::common_type_t<T, U, V> {
  using R = std::common_type_t<T, U, V>;
  return std::max<R>(R(minValue), std::min<R>(R(maxValue), R(value)));
}

inline uint32_t hostPrng = 0x12345678;
inline uint8_t random8(uint8_t max = 255) {
  hostPrng = hostPrng * 1664525u + 1013904223u;
  const uint8_t value = (hostPrng >> 16) & 0xff;
  return max ? value % max : 0;
}

inline uint8_t random8(uint8_t minValue, uint8_t maxValue) {
  if (maxValue <= minValue) return minValue;
  return minValue + random8(maxValue - minValue);
}

inline uint16_t random16(uint16_t max = 65535) {
  hostPrng = hostPrng * 1664525u + 1013904223u;
  const uint16_t value = (hostPrng >> 8) & 0xffff;
  return max ? value % max : 0;
}

inline uint16_t random16(uint16_t minValue, uint16_t maxValue) {
  if (maxValue <= minValue) return minValue;
  return minValue + random16(maxValue - minValue);
}

inline uint16_t random16_get_seed() {
  return hostPrng & 0xffff;
}

inline void random16_set_seed(uint16_t seed) {
  hostPrng = (hostPrng & 0xffff0000U) | seed;
}

inline uint16_t beat88(uint16_t beatsPerMinute88, uint32_t timebase = 0) {
  const float bpm = beatsPerMinute88 / 256.0f;
  const float seconds = (millis() - timebase) / 1000.0f;
  return uint16_t(std::fmod(seconds * bpm * 65536.0f / 60.0f, 65536.0f));
}

inline uint8_t beat8(uint16_t bpm, uint32_t timebase = 0) {
  const float seconds = (millis() - timebase) / 1000.0f;
  return uint8_t(std::fmod(seconds * bpm * 256.0f / 60.0f, 256.0f));
}

inline uint16_t beat16(uint16_t bpm, uint32_t timebase = 0) {
  const float seconds = (millis() - timebase) / 1000.0f;
  return uint16_t(std::fmod(seconds * bpm * 65536.0f / 60.0f, 65536.0f));
}

inline uint16_t beatsin88_t(uint16_t beatsPerMinute88, uint16_t low = 0, uint16_t high = 65535, uint32_t timebase = 0, uint16_t phaseOffset = 0) {
  const uint16_t beat = beat88(beatsPerMinute88, timebase);
  const uint16_t wave = uint16_t(int32_t(sin16_t(beat + phaseOffset)) + 32768);
  const uint16_t range = high - low;
  return low + scale16(wave, range);
}

inline uint8_t beatsin8_t(uint16_t bpm, uint8_t low = 0, uint8_t high = 255, uint32_t timebase = 0, uint8_t phaseOffset = 0) {
  const uint8_t beat = beat8(bpm, timebase);
  const uint8_t wave = sin8_t(beat + phaseOffset);
  const uint8_t range = high - low;
  return low + scale8(wave, range);
}

inline uint16_t beatsin16_t(uint16_t bpm, uint16_t low = 0, uint16_t high = 65535, uint32_t timebase = 0, uint16_t phaseOffset = 0) {
  const uint16_t beat = beat16(bpm, timebase);
  const uint16_t wave = uint16_t(int32_t(sin16_t(beat + phaseOffset)) + 32768);
  const uint16_t range = high - low;
  return low + scale16(wave, range);
}

inline uint8_t get_random_wheel_index(uint8_t pos) {
  uint8_t r = 0;
  uint8_t x = 0;
  do {
    r = random8();
    x = std::abs(int(pos) - int(r));
  } while (x < 42);
  return r;
}

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

struct SegmentData {
  uint8_t id = 0;
  uint16_t start = 0;
  uint16_t stop = 133;
  uint8_t brightness = 255;
  uint8_t mode = 9;
  uint8_t speed = 128;
  uint8_t intensity = 128;
  uint8_t custom1 = 128;
  uint8_t custom2 = 128;
  uint8_t custom3 = 16;
  bool check1 = false;
  bool check2 = false;
  bool check3 = false;
  uint8_t soundSim = 0;
  uint8_t palette = 0;
  uint32_t colors[NUM_COLORS] = {RGBW32(255, 160, 80, 0), BLACK, BLACK};
};

struct EffectContext {
  std::vector<CRGB>& leds;
  AudioData audio;
  SegmentData segment;
  float time = 0.0f;
  uint32_t frame = 0;
};

class HostSegment {
 public:
  uint16_t start = 0;
  uint16_t stop = 133;
  uint16_t offset = 0;
  uint8_t speed = 128;
  uint8_t intensity = 128;
  uint8_t palette = 0;
  uint8_t mode = 0;
  uint8_t opacity = 255;
  uint32_t colors[NUM_COLORS] = {RGBW32(255, 160, 80, 0), BLACK, BLACK};
  uint8_t custom1 = 128;
  uint8_t custom2 = 128;
  uint8_t custom3 = 16;
  bool check1 = false;
  bool check2 = false;
  bool check3 = false;
  bool reverse = false;
  uint8_t soundSim = 0;
  uint32_t step = 0;
  uint32_t call = 0;
  uint16_t aux0 = 0;
  uint16_t aux1 = 0;
  uint8_t* data = nullptr;

  uint16_t length() const { return stop > start ? stop - start : 0; }
  uint16_t width() const { return length(); }
  uint16_t height() const { return 1; }
  uint16_t virtualLength() const { return length(); }
  uint16_t virtualWidth() const { return length(); }
  uint16_t virtualHeight() const { return 1; }
  uint16_t nrOfVStrips() const { return 1; }
  bool is2D() const { return false; }
  uint32_t currentColor(uint8_t slot) const { return colors[slot % NUM_COLORS]; }
  bool allocateData(size_t len) {
    if (storage.size() != len) storage.assign(len, 0);
    data = storage.empty() ? nullptr : storage.data();
    return len == 0 || data != nullptr;
  }
  void deallocateData() {
    storage.clear();
    data = nullptr;
  }
  uint16_t dataSize() const { return storage.size(); }

  void setPixelColor(int n, uint32_t c);
  void setPixelColor(unsigned n, uint32_t c) { setPixelColor(int(n), c); }
  void setPixelColor(int n, byte r, byte g, byte b, byte w = 0) { setPixelColor(n, RGBW32(r, g, b, w)); }
  void setPixelColor(int n, CRGB c) { setPixelColor(n, toRgbw(c)); }
  void setPixelColorXY(int x, int, uint32_t c) { setPixelColor(x, c); }
  void setPixelColorXY(int x, int y, CRGB c) { setPixelColorXY(x, y, toRgbw(c)); }
  void setPixelColorXY(int x, int y, byte r, byte g, byte b, byte w = 0) { setPixelColorXY(x, y, RGBW32(r, g, b, w)); }
  uint32_t getPixelColor(int n) const;
  uint32_t getPixelColorXY(int x, int) const { return getPixelColor(x); }
  void fill(uint32_t c);
  void fade_out(uint8_t rate);
  void fadeToBlackBy(uint8_t fadeBy);
  void blur(uint8_t amount, bool smear = false);
  void blurCols(uint8_t amount, bool smear = false) { blur(amount, smear); }
  void move(uint8_t, uint8_t, bool = false) {}
  void drawCircle(uint16_t, uint16_t, uint8_t, uint32_t, bool = false) {}
  void blendPixelColor(int n, uint32_t color, uint8_t blend) { setPixelColor(n, color_blend(getPixelColor(n), color, blend)); }
  void blendPixelColor(int n, CRGB color, uint8_t blend) { blendPixelColor(n, toRgbw(color), blend); }
  void addPixelColor(int n, uint32_t color, bool fast = false) { setPixelColor(n, color_add(getPixelColor(n), color, fast)); }
  void addPixelColor(int n, CRGB color, bool fast = false) { addPixelColor(n, toRgbw(color), fast); }
  void fadePixelColor(uint16_t n, uint8_t fade) { setPixelColor(n, color_fade(getPixelColor(n), fade, true)); }
  uint32_t color_wheel(uint8_t pos) const;
  uint32_t color_from_palette(uint16_t index, bool mapping, bool wrap, uint8_t mcol, uint8_t pbri = 255) const;

 private:
  std::vector<uint8_t> storage;
};

class HostStrip {
 public:
  uint32_t now = 0;
  uint32_t timebase = 0;
  uint8_t paletteBlend = 1;
  bool isMatrix = false;
  uint8_t brightness = 180;
  uint16_t _virtualSegmentLength = 133;
  std::vector<HostSegment> _segments = {HostSegment{}};

  uint16_t getFrameTime() const { return FRAMETIME_FIXED; }
  bool isOffRefreshRequired() const { return false; }
  uint8_t getBrightness() const { return brightness; }
  uint8_t getActiveSegmentsNum() const { return _segments.size(); }
  uint8_t getCurrSegmentId() const { return currentSegment; }
  uint8_t getMaxSegments() const { return 32; }
  uint32_t segColor(uint8_t slot) const { return _segments[currentSegment].currentColor(slot); }
  void setPixelColor(unsigned i, uint32_t color);
  uint32_t getPixelColor(unsigned i) const;
  uint16_t getLengthTotal() const;
  void fill(uint32_t color);
  void bind(std::vector<CRGB>* target) { leds = target; }
  void selectSegment(uint8_t id);

 private:
  uint8_t currentSegment = 0;
  std::vector<CRGB>* leds = nullptr;
  friend class HostSegment;
};

extern HostStrip strip;
extern AudioData audioData;
extern float volumeSmth;
extern int16_t volumeRaw;
extern float FFT_MajorPeak;
extern float my_magnitude;
extern bool samplePeak;
extern uint8_t samplePeakByte;
extern uint8_t fftResult[16];
extern float fftBin[16];
extern uint8_t maxVol;
extern uint8_t binNum;

class UsermodManager {
 public:
  static bool getUMData(um_data_t** umData, uint8_t modId = USERMOD_ID_AUDIOREACTIVE);
};

um_data_t* simulateSound(uint8_t simulationId);

#define SEGMENT strip._segments[strip.getCurrSegmentId()]
#define SEGENV SEGMENT
#define SEGCOLOR(x) strip.segColor(x)
#define SEGLEN strip._virtualSegmentLength

void prepareWledFrame(EffectContext& ctx);
void finishWledFrame(EffectContext& ctx);
void render(EffectContext& ctx);
