import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Plugin } from "vite";

import { createAppContext } from "./context.js";
import { handleHttp } from "./http.js";
import { handleFrameUpgrade, handleUpgrade } from "./websocket.js";

const wledStaticPaths = new Set([
  "/",
  "/index.htm",
  "/index.css",
  "/index.js",
  "/iro.js",
  "/rangetouch.js",
  "/presets.json",
  "/settings",
  "/liveview",
  "/liveview2D",
]);

export function wledEmulatorPlugin(): Plugin {
  const ctx = createAppContext();

  return {
    name: "edc-wled-emulator",
    configureServer(server) {
      server.httpServer?.on("upgrade", (req: IncomingMessage, socket: Socket) => {
        const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
        if (pathname === "/ws") handleUpgrade(req, socket, ctx);
        else if (pathname === "/api/emulator/frames") handleFrameUpgrade(req, socket, ctx);
      });

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url) return next();
        const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
        if (!isEmulatorRequest(pathname)) return next();
        handleHttp(req, res, ctx, {
          devMode: true,
          transformIndexHtml: (url, html) => server.transformIndexHtml(url, html),
        }).catch(next);
      });
    },
  };
}

function isEmulatorRequest(pathname: string): boolean {
  if (
    pathname.startsWith("/emulator/@vite/")
    || pathname.startsWith("/emulator/@id/")
    || pathname.startsWith("/emulator/src/")
    || pathname.startsWith("/emulator/node_modules/")
  ) {
    return false;
  }
  return wledStaticPaths.has(pathname)
    || pathname.startsWith("/json")
    || pathname.startsWith("/api/emulator/")
    || pathname.startsWith("/emulator")
    || pathname === "/edit"
    || pathname === "/upload";
}
