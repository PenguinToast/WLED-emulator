import { fixtureMetadata } from "./fixture.js";
import { paletteData, palettes } from "./palettes.js";
import { clone } from "./util.js";
import { emulatorVersion } from "./config.js";
import { EDC_USERMOD_NAME, edcUsermodEffectRegistration } from "./edc-usermod.js";

export function infoObject(ctx) {
  const uptime = Math.floor((Date.now() - ctx.startedAt) / 1000);
  const ledCount = ctx.state.seg.reduce((max, seg) => Math.max(max, seg.stop || 0), 0) || 150;
  const seglc = ctx.state.seg.map(() => 0x01);
  return {
    ver: emulatorVersion,
    vid: 2505080,
    cn: "EDC",
    release: "WLED protocol emulator",
    name: "EDC WLED Emulator",
    brand: "WLED",
    product: "FOSS",
    mac: "CA:FE:ED:C0:DE:01",
    ip: "127.0.0.1",
    arch: "esp32",
    core: "node",
    lwip: 0,
    freeheap: 180000,
    uptime,
    time: new Date().toLocaleTimeString(),
    opt: 0,
    ws: 1,
    fxcount: ctx.catalog.effects.length,
    palcount: palettes.length,
    cpalcount: 0,
    ndc: 0,
    noaudio: false,
    live: false,
    lm: "",
    liveseg: -1,
    str: false,
    simplifiedui: false,
    leds: {
      count: ledCount,
      pwr: Math.round(ctx.state.bri * ledCount * 0.18),
      fps: 60,
      maxpwr: 850,
      maxseg: 8,
      bootps: -1,
      seglc,
      seglock: false,
      lc: 1,
      rgbw: false,
      wv: 0,
      cct: 0,
    },
    wifi: { bssid: "00:00:00:00:00:00", rssi: -35, signal: 88, channel: 1, ap: false },
    fs: { u: 48, t: 512, pmt: 1 },
    u: {
      AudioReactive: [
        `Vol ${ctx.audio.volume.toFixed(2)} Bass ${ctx.audio.bass.toFixed(2)}`,
        "",
      ],
      [EDC_USERMOD_NAME]: [
        `Effect ${edcUsermodEffectRegistration.id} ${ctx.edcUsermodConfig.enabled ? "enabled" : "disabled"}`,
        `Preset ${ctx.edcUsermodConfig.preset}`,
      ],
    },
    maps: [{ id: 0 }],
    fixture: fixtureMetadata(),
  };
}

export function fullJson(ctx) {
  return {
    state: clone(ctx.state),
    info: infoObject(ctx),
    effects: ctx.catalog.effects,
    fxdata: ctx.catalog.fxdata,
    palettes,
  };
}

export function siJson(ctx) {
  return {
    state: clone(ctx.state),
    info: infoObject(ctx),
  };
}

export function emulatorStateJson(ctx) {
  return {
    ...siJson(ctx),
    effects: ctx.catalog.effects,
    fxdata: ctx.catalog.fxdata,
    palettes,
    paletteData,
    audio: ctx.audio,
    usermods: {
      edc: ctx.edcUsermodConfig,
      registeredEffects: [edcUsermodEffectRegistration],
    },
    externalFrame: ctx.externalFrame,
    fixture: fixtureMetadata(),
  };
}
