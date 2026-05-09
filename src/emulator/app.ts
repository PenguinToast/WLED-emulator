import { bindAudioTuningControls, loadFile, postAudio, startComputerAudio, startMic, stopAudio, updateAudio } from "./audio.js";
import { ui } from "./dom.js";
import { model } from "./model.js";
import { applyNativeFrame } from "./native-frame.js";
import { draw, drawSpectrum } from "./renderer.js";
import { updateReadouts } from "./readouts.js";
import { connect, loadInitialState, pollEmulatorState } from "./transport.js";

export async function startApp() {
  try {
    bindAudioTuningControls();
    bindControls();
    await loadInitialState();
    connect();
    requestAnimationFrame(frame);
  } catch (error) {
    ui.status.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function bindControls() {
  ui.mic.addEventListener("click", startMic);
  ui.computerAudio.addEventListener("click", startComputerAudio);
  ui.file.addEventListener("change", () => loadFile(ui.file.files[0]));
  ui.stop.addEventListener("click", stopAudio);
}

function frame(now) {
  updateAudio();
  pollEmulatorState(now);
  applyNativeFrame();
  draw();
  drawSpectrum();
  updateReadouts();
  postAudio(now);
  model.frame += 1;
  requestAnimationFrame(frame);
}
