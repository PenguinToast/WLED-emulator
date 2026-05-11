import { join } from "node:path";
import { existsSync } from "node:fs";

import { builtEmulatorDir, builtEmulatorHtmlDir, emulatorDir, wledDir } from "./config.js";
import { updateAudioState } from "./audio-state.js";
import { applyStateUpdate, renderPreviewLeds } from "./device-state.js";
import { edcUsermodPresets, edcUsermodSettingsHtml, normalizeEdcUsermodConfig, persistEdcUsermodConfig } from "./edc-usermod.js";
import { paletteData, palettes } from "./palettes.js";
import { presetsJson } from "./presets.js";
import { htmlFile, json, readJsonBody, serveFile, serveStatic, text } from "./responses.js";
import { clone } from "./util.js";
import { applyUpload, isVersionInfoRequest } from "./version-info.js";
import { broadcast, externalFrameLedCount, updateExternalFrame } from "./websocket.js";
import { emulatorStateJson, fullJson, infoObject, siJson } from "./wled-json.js";

type HttpOptions = {
  devMode?: boolean;
  transformIndexHtml?: (url: string, html: string) => Promise<string>;
};

export async function handleHttp(req, res, ctx, options: HttpOptions = {}) {
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
    if (isVersionInfoRequest(url)) return json(res, ctx.versionInfo);
    if (url.pathname === "/json/eff" || url.pathname === "/json/effects") return json(res, ctx.catalog.effects);
    if (url.pathname === "/json/pal" || url.pathname === "/json/palettes") return json(res, palettes);
    if (url.pathname === "/json/fxdata") return json(res, ctx.catalog.fxdata);
    if (url.pathname === "/json/palx") return json(res, { m: palettes.length - 1, p: paletteData });
    if (url.pathname === "/json/nodes") return json(res, { nodes: [] });
    if (url.pathname === "/json/live") return json(res, { leds: renderPreviewLeds(ctx.state) });
    if (url.pathname === "/presets.json") return json(res, presetsJson());
    if (url.pathname === "/upload" && req.method === "POST") {
      const ok = await applyUpload(req, ctx);
      return text(res, ok ? "OK" : "Unsupported upload", ok ? 200 : 400);
    }
    if (url.pathname === "/api/emulator/audio" && req.method === "POST") {
      updateAudioState(ctx, await readJsonBody(req));
      return json(res, { ok: true });
    }
    if (url.pathname === "/api/emulator/audio") return json(res, ctx.audio);
    if (url.pathname === "/api/emulator/frame" && req.method === "POST") {
      const body = await readJsonBody(req);
      const fresh = updateExternalFrame(ctx, body);
      if (!fresh) return json(res, { ok: true, stale: true, count: externalFrameLedCount(ctx.externalFrame) });
      return json(res, { ok: true, count: externalFrameLedCount(ctx.externalFrame) });
    }
    if (url.pathname === "/api/emulator/frame") return json(res, ctx.externalFrame);
    if (url.pathname === "/api/emulator/state") return json(res, emulatorStateJson(ctx));
    if (url.pathname === "/api/usermods/edc" && req.method === "POST") {
      ctx.edcUsermodConfig = normalizeEdcUsermodConfig(await readJsonBody(req));
      persistEdcUsermodConfig(ctx.edcUsermodConfig);
      return json(res, { ok: true, config: ctx.edcUsermodConfig, presets: edcUsermodPresets });
    }
    if (url.pathname === "/api/usermods/edc") return json(res, { config: ctx.edcUsermodConfig, presets: edcUsermodPresets });
    if (url.pathname === "/settings/um" || url.pathname === "/settings/um.htm") {
      return text(res, edcUsermodSettingsHtml(ctx.edcUsermodConfig), 200, "text/html; charset=utf-8");
    }
    if (url.pathname === "/emulator") return redirect(res, "/emulator/");
    if (url.pathname === "/emulator/") {
      const filePath = options.devMode ? join(emulatorDir, "index.html") : builtOrSourceEmulatorFile("index.html");
      return htmlFile(res, filePath, (html) => transformHtml(options.transformIndexHtml, url.pathname, html));
    }
    if (url.pathname === "/emulator/audio-capture.html") {
      const filePath = options.devMode ? join(emulatorDir, "audio-capture.html") : builtOrSourceEmulatorFile("audio-capture.html");
      return htmlFile(res, filePath, (html) => transformHtml(options.transformIndexHtml, url.pathname, html));
    }
    if (url.pathname === "/emulator/liveview.html") {
      const filePath = options.devMode ? join(emulatorDir, "liveview.html") : builtOrSourceEmulatorFile("liveview.html");
      return htmlFile(res, filePath, (html) => transformHtml(options.transformIndexHtml, url.pathname, html));
    }
    if (url.pathname.startsWith("/emulator/")) return serveEmulatorStatic(res, url.pathname.replace(/^\/emulator\//, ""), Boolean(options.devMode));
    if (url.pathname === "/liveview" || url.pathname === "/liveview2D") {
      const filePath = options.devMode ? join(emulatorDir, "liveview.html") : builtOrSourceEmulatorFile("liveview.html");
      return htmlFile(res, filePath, (html) => transformHtml(options.transformIndexHtml, url.pathname, html));
    }
    if (url.pathname === "/" || url.pathname === "/index.htm") {
      return htmlFile(res, join(wledDir, "index.htm"));
    }
    if (["/index.css", "/index.js", "/iro.js", "/rangetouch.js"].includes(url.pathname)) {
      return serveFile(res, join(wledDir, url.pathname.slice(1)));
    }
    if (url.pathname === "/settings") return text(res, settingsIndexHtml(), 200, "text/html; charset=utf-8");
    text(res, "Not found", 404);
  } catch (error) {
    json(res, { error: error.message }, 500);
  }
}

async function transformHtml(transformIndexHtml: HttpOptions["transformIndexHtml"], url: string, html: string): Promise<string> {
  return transformIndexHtml ? transformIndexHtml(url, html) : html;
}

function applyPatch(ctx, patch) {
  applyStateUpdate(ctx.state, patch, ctx.catalog);
  broadcast(ctx, siJson(ctx));
}

function redirect(res, location: string) {
  res.writeHead(308, { location });
  res.end();
}

function settingsIndexHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WLED Settings</title><style>body{font:15px system-ui,sans-serif;background:#101214;color:#f0f4f8;margin:0;padding:24px}a{color:#79c7ff}</style></head><body><h1>WLED Settings</h1><p><a href="/settings/um">Usermod Settings</a></p><p><a href="/">Back to WLED</a></p></body></html>`;
}

function builtOrSourceEmulatorFile(relativePath: string) {
  const builtPath = join(builtEmulatorHtmlDir, relativePath);
  return existsSync(builtPath) ? builtPath : join(emulatorDir, relativePath);
}

function serveEmulatorStatic(res, relativePath: string, devMode: boolean) {
  if (!devMode) {
    for (const base of [builtEmulatorHtmlDir, builtEmulatorDir]) {
      const builtPath = join(base, relativePath);
      if (existsSync(builtPath)) return serveFile(res, builtPath);
    }
  }
  return serveStatic(res, emulatorDir, relativePath);
}
