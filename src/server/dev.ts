import type { Server } from "node:http";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";

import { rootDir } from "./config.js";

export type DevServer = ViteDevServer;

export async function createDevServer(httpServer: Server): Promise<DevServer | null> {
  if (process.env.EDC_DEV_SERVER !== "1") return null;
  return createViteServer({
    root: rootDir,
    appType: "custom",
    publicDir: "public",
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
    plugins: [
      {
        name: "edc-full-reload",
        handleHotUpdate({ file, server }) {
          if (file.includes("/public/") || file.includes("/docs/")) {
            server.ws.send({ type: "full-reload" });
          }
        },
      },
    ],
  });
}

export async function transformHtml(devServer: DevServer | null, url: string, html: string): Promise<string> {
  if (!devServer) return html;
  return devServer.transformIndexHtml(url, html);
}

export async function serveViteAsset(devServer: DevServer | null, req, res): Promise<boolean> {
  if (!devServer || !req.url) return false;
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (!pathname.startsWith("/@vite/") && !pathname.startsWith("/@id/") && !pathname.startsWith("/node_modules/")) {
    return false;
  }
  await new Promise<void>((resolve) => devServer.middlewares(req, res, () => resolve()));
  return true;
}
