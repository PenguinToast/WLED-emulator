import { loadFile, postAudio, startMic, stopAudio, updateAudio } from "./audio.js";
import { ui } from "./dom.js";
import { bindCustomEditor, compileCustom, renderEffect } from "./effects.js";
import { model } from "./model.js";
import { draw, drawSpectrum } from "./renderer.js";
import { updateReadouts } from "./readouts.js";
import { connect, loadInitialState, pollEmulatorState } from "./transport.js";

export async function startApp() {
  bindControls();
  bindCustomEditor();
  compileCustom();
  await loadInitialState();
  connect();
  requestAnimationFrame(frame);
}

function bindControls() {
  ui.mic.addEventListener("click", startMic);
  ui.file.addEventListener("change", () => loadFile(ui.file.files[0]));
  ui.stop.addEventListener("click", stopAudio);
}

function frame(now) {
  updateAudio();
  pollEmulatorState(now);
  renderEffect(now / 1000);
  draw();
  drawSpectrum();
  updateReadouts();
  postAudio(now);
  model.frame += 1;
  requestAnimationFrame(frame);
}

