import { ui } from "./dom.js";
import { activeSegment, audio, ledCount, model } from "./model.js";

export function updateReadouts() {
  const segment = activeSegment();
  ui.power.textContent = model.state?.on && segment.on ? "On" : "Off";
  ui.brightness.textContent = String(model.state?.bri ?? "-");
  ui.effect.textContent = model.effects[segment.fx] || `#${segment.fx}`;
  ui.palette.textContent = model.palettes[segment.pal] || `#${segment.pal}`;
  ui.ledCount.textContent = `${ledCount()} across ${model.state?.seg?.length || 1} rings`;
  ui.volume.textContent = audio.volume.toFixed(2);
  ui.bass.textContent = audio.bass.toFixed(2);
  ui.mid.textContent = audio.mid.toFixed(2);
  ui.treble.textContent = audio.treble.toFixed(2);
  ui.bpm.textContent = audio.bpm ? String(Math.round(audio.bpm)) : "-";
}
