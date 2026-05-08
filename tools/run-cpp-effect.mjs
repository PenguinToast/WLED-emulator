import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { generateUpstreamFx } from "./generate-upstream-fx.mjs";

const server = process.env.WLED_EMULATOR_URL || "http://127.0.0.1:5173";
const cxx = process.env.CXX || "c++";
const binary = "/tmp/edc-wled-cpp-effect";
const sources = ["cpp_harness/main.cpp", "cpp_harness/custom_effect.cpp", "cpp_harness/wled_compat.cpp"];

async function run(command, args) {
  const child = spawn(command, args, { stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} exited with ${code}`);
}

await generateUpstreamFx();
await run(cxx, ["-std=c++17", "-O2", "-Icpp_harness", ...sources, "cpp_harness/generated/upstream_fx_1d.cpp", "-o", binary]);

const effect = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });
effect.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
effect.stdin.on("error", (error) => {
  if (error.code !== "EPIPE") console.error(error.message);
});
effect.on("exit", (code) => {
  if (code !== null && code !== 0) {
    console.error(`C++ effect exited with ${code}`);
    process.exit(code);
  }
});
const lines = createInterface({ input: effect.stdout });
const pending = [];
lines.on("line", (line) => pending.push(line));

let frame = 0;
let lastPost = 0;
const startedAt = Date.now();

async function tick() {
  const now = Date.now();
  const state = await fetch(`${server}/api/emulator/state`).then((res) => res.json());
  const segments = state.state.seg?.length ? state.state.seg : [];
  const audio = state.audio || {};
  if (!effect.stdin.writable) return;
  const fields = [
    ((now - startedAt) / 1000).toFixed(3),
    frame,
    state.state.bri ?? 180,
    segments.length,
    audio.volume ?? 0,
    audio.bass ?? 0,
    audio.mid ?? 0,
    audio.treble ?? 0,
    audio.beat ? 1 : 0,
    audio.bpm ?? 0,
  ];
  for (const segment of segments) {
    fields.push(
      segment.id ?? index,
      segment.start ?? 0,
      segment.stop ?? ((segment.start ?? 0) + (segment.len ?? 1)),
      segment.bri ?? 255,
      segment.fx ?? 9,
      segment.sx ?? 128,
      segment.ix ?? 128,
      segment.pal ?? 0,
      state.state.on && segment.on ? 1 : 0,
    );
    const colors = Array.isArray(segment.col) ? segment.col : [];
    for (let index = 0; index < 3; index += 1) {
      const color = Array.isArray(colors[index]) ? colors[index] : [0, 0, 0];
      fields.push(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0);
    }
  }
  effect.stdin.write(`${fields.join(" ")}\n`);

  let latestPayload = null;
  while (pending.length) {
    latestPayload = JSON.parse(pending.shift());
  }
  if (latestPayload && now - lastPost > 16) {
    lastPost = now;
    await fetch(`${server}/api/emulator/frame`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "cpp_harness", leds: latestPayload.leds }),
    });
  }
  frame += 1;
}

console.log(`Streaming C++ effect frames to ${server}/emulator`);
const interval = setInterval(() => tick().catch((error) => console.error(error.message)), 16);

process.on("SIGINT", () => {
  clearInterval(interval);
  effect.kill("SIGINT");
  process.exit(0);
});
