#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(root, "artifacts/audio/samples.json");
const force = process.argv.includes("--force");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const audioDir = join(root, "artifacts/audio");
await mkdir(audioDir, { recursive: true });

for (const sample of manifest.samples) {
  const target = join(audioDir, sample.file);
  if (!force && await exists(target)) {
    console.log(`exists ${sample.file}`);
    continue;
  }

  const headers = {
    ...manifest.defaultRequestHeaders,
    ...sample.requestHeaders,
  };

  console.log(`download ${sample.file}`);
  await download(sample.downloadUrl, target, headers, manifest.rejectUnauthorized !== false);

  if (sample.sha256) {
    const digest = await sha256(target);
    if (digest !== sample.sha256) {
      throw new Error(`${sample.file} sha256 mismatch: expected ${sample.sha256}, got ${digest}`);
    }
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target, headers, rejectUnauthorized, redirects = 0) {
  if (redirects > 5) throw new Error(`${url} redirected too many times`);

  const temporary = `${target}.tmp`;
  try {
    const result = await new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === "https:" ? https : http;
      const request = client.get(parsed, { headers, rejectUnauthorized }, (response) => {
        const location = response.headers.location;
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
          response.resume();
          download(new URL(location, parsed).toString(), target, headers, rejectUnauthorized, redirects + 1)
            .then(() => resolve("redirected"), reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${url} returned ${response.statusCode}`));
          return;
        }

        const contentType = response.headers["content-type"] || "";
        if (!String(contentType).startsWith("audio/")) {
          response.resume();
          reject(new Error(`${url} returned unexpected content-type ${contentType || "(none)"}`));
          return;
        }

        const output = createWriteStream(temporary);
        response.pipe(output);
        output.on("finish", resolve);
        output.on("error", reject);
      });
      request.on("error", reject);
    });
    if (result === "redirected") return;
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  const data = await readFile(path);
  hash.update(data);
  return hash.digest("hex");
}
