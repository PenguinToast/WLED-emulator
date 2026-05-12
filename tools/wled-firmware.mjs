import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";

const root = resolve(new URL("../", import.meta.url).pathname);
const sourceDir = resolve(process.env.WLED_SOURCE || join(root, "vendor/WLED"));
const stageDir = resolve(process.env.WLED_FIRMWARE_STAGE || join(root, "artifacts/firmware/WLED"));
const usermodDir = resolve(process.env.EDC_USERMOD_DIR || join(root, "usermods/edc_dance"));
const baseEnv = process.env.WLED_ENV || "esp32s3dev_8MB_qspi";
const envName = process.env.WLED_BUILD_ENV || `edc_${baseEnv}`;

const command = process.argv[2] || "build";
const uploadPort = readOption("--upload-port") || process.env.UPLOAD_PORT;

if (!["prepare", "build", "upload", "clean"].includes(command)) {
  console.error("Usage: node tools/wled-firmware.mjs [prepare|build|upload|clean] [--upload-port /dev/cu.usbserial-*]");
  process.exit(2);
}

if (command === "clean") {
  await rm(stageDir, { recursive: true, force: true });
  console.log(`Removed ${stageDir}`);
  process.exit(0);
}

await prepareStage();

if (command === "prepare") {
  console.log(`Prepared WLED firmware stage at ${stageDir}`);
  console.log(`PlatformIO env: ${envName}`);
  process.exit(0);
}

const pio = await findPlatformio();
const args = ["run", "-e", envName];
if (command === "upload") {
  args.push("-t", "upload");
  if (uploadPort) args.push("--upload-port", uploadPort);
}
await run(pio, args, { cwd: stageDir });

async function prepareStage() {
  await assertReadable(join(sourceDir, "platformio.ini"), `WLED source not found at ${sourceDir}`);
  await assertReadable(join(usermodDir, "library.json"), `EDC usermod not found at ${usermodDir}`);
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  await cp(sourceDir, stageDir, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (path) => !path.includes(`${sourceDir}/.git`) && !path.includes(`${sourceDir}/.pio`),
  });
  await patchPython39TypeHints();
  await writeFile(join(stageDir, "platformio_override.ini"), platformioOverride());
}

async function patchPython39TypeHints() {
  const replacements = [
    [join(stageDir, "pio-scripts/load_usermods.py"), "-> str | None", "-> Optional[str]"],
    [join(stageDir, "pio-scripts/validate_modules.py"), "comp_dir: str | None, name: str | None", "comp_dir: Optional[str], name: Optional[str]"],
  ];
  for (const [path, from, to] of replacements) {
    let source = await readFile(path, "utf8");
    if (!source.includes("from typing import Optional")) {
      source = source.replace(/(import re\n)/, "$1from typing import Optional\n");
    }
    source = source.replaceAll(from, to);
    await writeFile(path, source);
  }
}

function platformioOverride() {
  return `[platformio]
default_envs = ${envName}

[env:${envName}]
extends = env:${baseEnv}
custom_usermods =
  \${env:${baseEnv}.custom_usermods}
  edc_dance = symlink://${usermodDir}
`;
}

async function findPlatformio() {
  const candidates = [
    process.env.PLATFORMIO_CMD,
    "pio",
    "platformio",
    join(homedir(), ".platformio/penv/bin/pio"),
    join(homedir(), ".local/bin/pio"),
    join(homedir(), ".local/bin/platformio"),
    join(homedir(), "Library/Python/3.9/bin/pio"),
    join(homedir(), "Library/Python/3.9/bin/platformio"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
    if (await commandExists(candidate)) return candidate;
  }
  throw new Error("PlatformIO was not found. Install it with `python3 -m pip install --user platformio` or set PLATFORMIO_CMD.");
}

async function commandExists(candidate) {
  const shell = process.platform === "win32" ? "where" : "sh";
  const args = process.platform === "win32" ? [candidate] : ["-c", `command -v ${shellQuote(candidate)}`];
  const child = spawn(shell, args, { stdio: "ignore" });
  const [code] = await once(child, "exit");
  return code === 0;
}

async function assertReadable(path, message) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(message);
  }
}

async function run(cmd, args, options) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, { stdio: "inherit", ...options });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${cmd} exited with ${code}`);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
