import { emulatorVersion } from "./config.mjs";

const VERSION_INFO_PATH = "/version-info.json";

export function createInitialVersionInfo() {
  return {
    version: emulatorVersion,
    neverAsk: false,
    alwaysReport: false,
  };
}

export function isVersionInfoRequest(url) {
  return url.pathname === "/edit" && url.searchParams.get("edit") === VERSION_INFO_PATH;
}

export async function applyUpload(req, ctx) {
  const contentType = req.headers["content-type"] || "";
  const body = await readBody(req);
  if (!contentType.includes("multipart/form-data")) return false;
  if (!body.includes('filename="version-info.json"')) return false;

  const jsonText = extractJsonPayload(body);
  if (!jsonText) return false;
  const next = JSON.parse(jsonText);
  ctx.versionInfo = normalizeVersionInfo(next);
  return true;
}

function normalizeVersionInfo(value) {
  return {
    version: String(value?.version || emulatorVersion),
    neverAsk: Boolean(value?.neverAsk),
    alwaysReport: Boolean(value?.alwaysReport),
  };
}

function extractJsonPayload(body) {
  const match = /\r?\n\r?\n([\s\S]*?)\r?\n--/.exec(body);
  return match?.[1]?.trim() || "";
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
