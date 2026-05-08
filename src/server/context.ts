import { createInitialState, normalizeState } from "./device-state.js";
import { createInitialVersionInfo } from "./version-info.js";
import { loadOfficialWledEffects } from "./wled-catalog.js";

export function createAppContext() {
  const catalog = loadOfficialWledEffects();
  const state = createInitialState();
  normalizeState(state, catalog);
  return {
    startedAt: Date.now(),
    catalog,
    state,
    sockets: new Set(),
    frameSockets: new Set(),
    audio: {
      volume: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      beat: false,
      bpm: 0,
      majorPeak: 0,
      magnitude: 0,
      bins: Array.from({ length: 16 }, () => 0),
      source: "",
      profile: "",
      updatedAt: 0,
    },
    externalFrame: {
      leds: [],
      rgb: "",
      updatedAt: 0,
      source: "",
      frame: 0,
      streamId: "",
    },
    versionInfo: createInitialVersionInfo(),
  };
}
