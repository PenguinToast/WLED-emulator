import { bindAudioTuningControls, loadFile, postAudio, startComputerAudio, startMic, stopAudio, updateAudio } from "./audio.js";
import { ui } from "./dom.js";
import { display, model } from "./model.js";
import { applyNativeFrame } from "./native-frame.js";
import { draw, drawSpectrum } from "./renderer.js";
import { updateReadouts } from "./readouts.js";
import { connect, loadInitialState, pollEmulatorState } from "./transport.js";

const DIFFUSER_STORAGE_KEY = "edc-wled-emulator.diffuser";

export async function startApp() {
  try {
    bindAudioTuningControls();
    bindControls();
    loadDisplayOptions();
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
  ui.diffuser.addEventListener("click", () => {
    display.diffuser = !display.diffuser;
    localStorage.setItem(DIFFUSER_STORAGE_KEY, display.diffuser ? "1" : "0");
    updateDiffuserButton();
  });
}

function loadDisplayOptions() {
  display.diffuser = localStorage.getItem(DIFFUSER_STORAGE_KEY) === "1";
  updateDiffuserButton();
}

function updateDiffuserButton() {
  ui.diffuser.setAttribute("aria-pressed", String(display.diffuser));
  ui.diffuser.classList.toggle("active", display.diffuser);
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
