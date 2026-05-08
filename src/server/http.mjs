import { join } from "node:path";

import { emulatorDir, wledDir } from "./config.mjs";
import { applyStateUpdate, renderPreviewLeds } from "./device-state.mjs";
import { paletteData, palettes } from "./palettes.mjs";
import { presetsJson } from "./presets.mjs";
import { json, readJsonBody, serveFile, serveStatic, text } from "./responses.mjs";
import { clamp, clone } from "./util.mjs";
import { broadcast } from "./websocket.mjs";
import { emulatorStateJson, fullJson, infoObject, siJson } from "./wled-json.mjs";

export async function handleHttp(req, res, ctx) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/ws" && req.headers.upgrade?.toLowerCase() === "websocket") return;

  try {
    if (url.pathname === "/json" || url.pathname === "/json/si") {
      if (req.method === "POST") applyPatch(ctx, await readJsonBody(req));
      json(res, url.pathname === "/json" ? fullJson(ctx) : siJson(ctx));
      return;
    }
    if (url.pathname === "/json/state") {
      if (req.method === "POST") applyPatch(ctx, await readJsonBody(req));
      json(res, clone(ctx.state));
      return;
    }
    if (url.pathname === "/json/info") return json(res, infoObject(ctx));
    if (url.pathname === "/json/eff" || url.pathname === "/json/effects") return json(res, ctx.catalog.effects);
    if (url.pathname === "/json/pal" || url.pathname === "/json/palettes") return json(res, palettes);
    if (url.pathname === "/json/fxdata") return json(res, ctx.catalog.fxdata);
    if (url.pathname === "/json/palx") return json(res, { m: palettes.length - 1, p: paletteData });
    if (url.pathname === "/json/nodes") return json(res, { nodes: [] });
    if (url.pathname === "/json/live") return json(res, { leds: renderPreviewLeds(ctx.state) });
    if (url.pathname === "/presets.json") return json(res, presetsJson());
    if (url.pathname === "/api/emulator/audio" && req.method === "POST") {
      const body = await readJsonBody(req);
      Object.assign(ctx.audio, {
        volume: clamp(Number(body?.volume ?? 0), 0, 1),
        bass: clamp(Number(body?.bass ?? 0), 0, 1),
        mid: clamp(Number(body?.mid ?? 0), 0, 1),
        treble: clamp(Number(body?.treble ?? 0), 0, 1),
        beat: Boolean(body?.beat),
        bpm: clamp(Number(body?.bpm ?? 0), 0, 300),
        updatedAt: Date.now(),
      });
      return json(res, { ok: true });
    }
    if (url.pathname === "/api/emulator/frame" && req.method === "POST") {
      const body = await readJsonBody(req);
      ctx.externalFrame = {
        leds: Array.isArray(body?.leds) ? body.leds : [],
        updatedAt: Date.now(),
        source: String(body?.source || "external"),
      };
      return json(res, { ok: true, count: ctx.externalFrame.leds.length });
    }
    if (url.pathname === "/api/emulator/state") return json(res, emulatorStateJson(ctx));
    if (url.pathname === "/emulator" || url.pathname === "/emulator/") return serveFile(res, join(emulatorDir, "index.html"));
    if (url.pathname.startsWith("/emulator/")) return serveStatic(res, emulatorDir, url.pathname.replace(/^\/emulator\//, ""));
    if (url.pathname === "/liveview" || url.pathname === "/liveview2D") return serveFile(res, join(emulatorDir, "liveview.html"));
    if (url.pathname === "/" || url.pathname === "/index.htm") return serveFile(res, join(wledDir, "index.htm"));
    if (["/index.css", "/index.js", "/iro.js", "/rangetouch.js"].includes(url.pathname)) {
      return serveFile(res, join(wledDir, url.pathname.slice(1)));
    }
    if (url.pathname === "/settings") return text(res, "Settings are not emulated yet. Use the main WLED UI and /emulator.", 200, "text/html; charset=utf-8");
    text(res, "Not found", 404);
  } catch (error) {
    json(res, { error: error.message }, 500);
  }
}

function applyPatch(ctx, patch) {
  applyStateUpdate(ctx.state, patch, ctx.catalog);
  broadcast(ctx, siJson(ctx));
}

