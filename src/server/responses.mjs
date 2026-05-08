import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

export function json(res, value, status = 200) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

export function text(res, body, status = 200, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

export async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return null;
  return JSON.parse(body);
}

export function serveStatic(res, baseDir, relativePath) {
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  return serveFile(res, join(baseDir, safePath));
}

export function serveFile(res, filePath) {
  if (!existsSync(filePath)) return text(res, "Not found", 404);
  res.writeHead(200, { "content-type": mimeType(filePath), "cache-control": "no-store" });
  createReadStream(filePath).pipe(res);
}

function mimeType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extname(filePath)] || "application/octet-stream";
}

