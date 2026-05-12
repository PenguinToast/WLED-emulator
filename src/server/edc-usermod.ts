import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { edcUsermodConfigPath } from "./config.js";
import { clampInt, clone } from "./util.js";

export const EDC_USERMOD_NAME = "EDC Dance";
export const EDC_USERMOD_EFFECT_ID = 220;
export const EDC_USERMOD_EFFECT_DATA = "EDC Custom@Speed,Beat Focus,Tightness,Impact,Accent Mix;!,!,!;!;1vf;sx=192,ix=150,c1=190,c2=190,c3=18,pal=4,m12=2,si=0";

export const edcUsermodEffectRegistration = {
  requestedId: 255,
  id: EDC_USERMOD_EFFECT_ID,
  mode: "mode_edc_custom",
  data: EDC_USERMOD_EFFECT_DATA,
};

const presetDefaults = {
  auto: {
    enabled: true,
    preset: "auto",
    autoAdapt: true,
    segmentDelayMs: 22,
    outwardFade: 8,
    rumbleAmount: 42,
    accentAmount: 128,
    primaryMinGapMs: 118,
  },
  fourOnFloor: {
    enabled: true,
    preset: "fourOnFloor",
    autoAdapt: true,
    segmentDelayMs: 20,
    outwardFade: 9,
    rumbleAmount: 34,
    accentAmount: 122,
    primaryMinGapMs: 112,
  },
  bassMusic: {
    enabled: true,
    preset: "bassMusic",
    autoAdapt: true,
    segmentDelayMs: 24,
    outwardFade: 7,
    rumbleAmount: 58,
    accentAmount: 114,
    primaryMinGapMs: 130,
  },
  trance: {
    enabled: true,
    preset: "trance",
    autoAdapt: true,
    segmentDelayMs: 18,
    outwardFade: 10,
    rumbleAmount: 30,
    accentAmount: 150,
    primaryMinGapMs: 104,
  },
};

export const edcUsermodPresets = clone(presetDefaults);

export function defaultEdcUsermodConfig() {
  return clone(presetDefaults.auto);
}

export function loadEdcUsermodConfig() {
  if (!existsSync(edcUsermodConfigPath)) return defaultEdcUsermodConfig();
  try {
    return normalizeEdcUsermodConfig(JSON.parse(readFileSync(edcUsermodConfigPath, "utf8")));
  } catch {
    return defaultEdcUsermodConfig();
  }
}

export function persistEdcUsermodConfig(config) {
  mkdirSync(dirname(edcUsermodConfigPath), { recursive: true });
  writeFileSync(edcUsermodConfigPath, `${JSON.stringify(normalizeEdcUsermodConfig(config), null, 2)}\n`);
}

export function normalizeEdcUsermodConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const preset = normalizePreset(source.preset);
  const base = source.applyPreset ? presetDefaults[preset] : presetDefaults.auto;
  return {
    enabled: source.enabled === undefined ? base.enabled : Boolean(source.enabled),
    preset,
    autoAdapt: source.autoAdapt === undefined ? base.autoAdapt : Boolean(source.autoAdapt),
    segmentDelayMs: clampInt(source.segmentDelayMs ?? base.segmentDelayMs, 1, 120),
    outwardFade: clampInt(source.outwardFade ?? base.outwardFade, 0, 32),
    rumbleAmount: clampInt(source.rumbleAmount ?? base.rumbleAmount, 0, 128),
    accentAmount: clampInt(source.accentAmount ?? base.accentAmount, 16, 255),
    primaryMinGapMs: clampInt(source.primaryMinGapMs ?? base.primaryMinGapMs, 60, 300),
  };
}

export function edcUsermodSettingsHtml(config) {
  const jsonConfig = JSON.stringify(normalizeEdcUsermodConfig(config));
  const jsonPresets = JSON.stringify(edcUsermodPresets);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WLED Usermod Settings</title>
  <style>
    :root { color-scheme: dark; font: 15px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101214; color: #f0f4f8; }
    body { margin: 0; padding: 24px; }
    main { max-width: 760px; margin: 0 auto; }
    a { color: #79c7ff; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 8px; font-size: 18px; }
    form { display: grid; gap: 14px; margin-top: 22px; }
    label { display: grid; gap: 6px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #2b333c; padding-top: 14px; }
    input[type="range"] { width: min(420px, 100%); }
    input[type="number"], select { background: #171c22; color: #f0f4f8; border: 1px solid #3a4652; border-radius: 6px; padding: 8px; }
    button { width: fit-content; background: #0f78bd; color: white; border: 0; border-radius: 6px; padding: 10px 16px; font-weight: 650; cursor: pointer; }
    .hint { color: #a9b7c5; margin: 0; }
    .status { min-height: 22px; color: #88e0a4; }
    .value { min-width: 42px; text-align: right; color: #d5e6f8; }
  </style>
</head>
<body>
  <main>
    <p><a href="/">Back to WLED</a> · <a href="/emulator/">Emulator</a></p>
    <h1>Usermod Settings</h1>
    <p class="hint">EDC Dance registers the EDC Custom effect through the usermod effect API. These settings mirror the static cfg.json knobs; live feel should come from adaptive audio analysis and the EDC Custom effect sliders.</p>
    <h2>${EDC_USERMOD_NAME}</h2>
    <form id="settings">
      <label><span>Preset</span><select name="preset">
        <option value="auto">Auto</option>
        <option value="fourOnFloor">Four on Floor</option>
        <option value="bassMusic">Bass Music</option>
        <option value="trance">Trance</option>
      </select></label>
      <label class="row"><span>Enabled</span><input type="checkbox" name="enabled"></label>
      <label class="row"><span>Adaptive detector</span><input type="checkbox" name="autoAdapt"></label>
      ${range("segmentDelayMs", "Segment propagation ms", 1, 120)}
      ${range("outwardFade", "Outer ring attenuation", 0, 32)}
      ${range("rumbleAmount", "Sustained bass glow", 0, 128)}
      ${range("accentAmount", "Accent output scale", 16, 255)}
      ${range("primaryMinGapMs", "Beat retrigger floor ms", 60, 300)}
      <button type="submit">Save</button>
      <p class="status" id="status"></p>
    </form>
  </main>
  <script>
    const initial = ${jsonConfig};
    const presets = ${jsonPresets};
    const form = document.getElementById("settings");
    const status = document.getElementById("status");
    function setValues(config) {
      for (const [key, value] of Object.entries(config)) {
        const input = form.elements[key];
        if (!input) continue;
        if (input.type === "checkbox") input.checked = Boolean(value);
        else input.value = value;
      }
      updateLabels();
    }
    function updateLabels() {
      form.querySelectorAll("[data-value-for]").forEach((node) => {
        const input = form.elements[node.dataset.valueFor];
        node.textContent = input ? input.value : "";
      });
    }
    function values() {
      return {
        preset: form.elements.preset.value,
        enabled: form.elements.enabled.checked,
        autoAdapt: form.elements.autoAdapt.checked,
        segmentDelayMs: Number(form.elements.segmentDelayMs.value),
        outwardFade: Number(form.elements.outwardFade.value),
        rumbleAmount: Number(form.elements.rumbleAmount.value),
        accentAmount: Number(form.elements.accentAmount.value),
        primaryMinGapMs: Number(form.elements.primaryMinGapMs.value),
      };
    }
    form.addEventListener("input", updateLabels);
    form.elements.preset.addEventListener("change", () => setValues(presets[form.elements.preset.value] || initial));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const response = await fetch("/api/usermods/edc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values()),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Save failed");
      setValues(body.config);
      status.textContent = "Saved";
      setTimeout(() => status.textContent = "", 1800);
    });
    setValues(initial);
  </script>
</body>
</html>`;
}

function normalizePreset(value) {
  return Object.prototype.hasOwnProperty.call(presetDefaults, value) ? value : "auto";
}

function range(name, label, min, max) {
  return `<label><span>${label}</span><span class="row"><input type="range" name="${name}" min="${min}" max="${max}" step="1"><span class="value" data-value-for="${name}"></span></span></label>`;
}
