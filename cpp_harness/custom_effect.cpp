#include "edc_usermod.hpp"
#include "generated/upstream_fx_1d.hpp"

void render(EffectContext& ctx) {
  prepareWledFrame(ctx);
  const uint8_t mode = SEGMENT.mode;

  if (mode == edcDanceUsermod.getEffectId()) {
    mode_edc_custom();
  } else if (UpstreamModePtr upstream = upstreamModeFor(mode)) {
    upstream();
  } else {
    SEGMENT.fill(BLACK);
  }

  finishWledFrame(ctx);
}
