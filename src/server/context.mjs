import { createInitialState, normalizeState } from "./device-state.mjs";
import { createInitialVersionInfo } from "./version-info.mjs";
import { loadOfficialWledEffects } from "./wled-catalog.mjs";

export function createAppContext() {
  const catalog = loadOfficialWledEffects();
  const state = createInitialState();
  normalizeState(state, catalog);
  return {
    startedAt: Date.now(),
    catalog,
    state,
    sockets: new Set(),
    audio: {
      volume: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      beat: false,
      bpm: 0,
      updatedAt: 0,
    },
    externalFrame: {
      leds: [],
      updatedAt: 0,
      source: "",
    },
    versionInfo: createInitialVersionInfo(),
  };
}
