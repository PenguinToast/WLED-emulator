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
lines.on("line", (line) => pending.push(parseFrameLine(line)));

function parseFrameLine(line) {
  if (!line.startsWith("F ")) return JSON.parse(line);
  return { rgb: line.slice(2).trim() };
}

let frame = 0;
const startedAt = Date.now();
const streamId = `cpp_harness:${startedAt}`;
const audioTimeoutMs = 1200;
let cachedState = await fetch(`${server}/api/emulator/state`).then((res) => res.json());
let cachedAudio = cachedState.audio || {};
let lastStateFetch = 0;
let stateFetchPending = false;
let frameSocket = null;
let lastFrameSocketAttempt = 0;
let lastAudioSocketWarning = 0;

function frameWebSocketUrl() {
  return `${server.replace(/^http/, "ws")}/api/emulator/frames`;
}

function ensureFrameSocket(now) {
  if (typeof WebSocket === "undefined") return;
  if (frameSocket?.readyState === WebSocket.OPEN || frameSocket?.readyState === WebSocket.CONNECTING) return;
  if (now - lastFrameSocketAttempt < 1000) return;
  lastFrameSocketAttempt = now;
  frameSocket = new WebSocket(frameWebSocketUrl());
  frameSocket.addEventListener("message", handleFrameSocketMessage);
  frameSocket.addEventListener("close", clearFrameSocket);
  frameSocket.addEventListener("error", () => {
    frameSocket?.close();
    clearFrameSocket();
  });
}

function handleFrameSocketMessage(event) {
  try {
    const message = JSON.parse(String(event.data));
    if (message?.type === "audio") cachedAudio = message;
  } catch {
    // Ignore malformed bus messages.
  }
}

function clearFrameSocket() {
  frameSocket = null;
}

function refreshState(now) {
  if (stateFetchPending || now - lastStateFetch < 100) return;
  lastStateFetch = now;
  stateFetchPending = true;
  fetch(`${server}/api/emulator/state`)
    .then((res) => res.json())
    .then((state) => {
      cachedState = state;
    })
    .catch((error) => console.error(error.message))
    .finally(() => {
      stateFetchPending = false;
    });
}

function refreshAudio(now) {
  if (frameSocket?.readyState === WebSocket.OPEN) return;
  if (frameSocket?.readyState === WebSocket.CONNECTING) return;
  if (now - lastAudioSocketWarning > 2000) {
    lastAudioSocketWarning = now;
    console.error("Audio WebSocket disconnected; native effects will use stale audio until it reconnects.");
  }
}

function tick() {
  const now = Date.now();
  refreshState(now);
  ensureFrameSocket(now);
  refreshAudio(now);
  const state = cachedState;
  const segments = state.state.seg?.length ? state.state.seg : [];
  const audio = isFreshAudio(cachedAudio, now) ? cachedAudio : {};
  const bins = Array.isArray(audio.bins) ? audio.bins.slice(0, 16) : [];
  while (bins.length < 16) bins.push(0);
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
    audio.majorPeak ?? 0,
    audio.magnitude ?? 0,
    bins.length,
    ...bins,
  ];
  for (const [index, segment] of segments.entries()) {
    fields.push(
      segment.id ?? index,
      segment.start ?? 0,
      segment.stop ?? ((segment.start ?? 0) + (segment.len ?? 1)),
      segment.bri ?? 255,
      segment.fx ?? 9,
      segment.sx ?? 128,
      segment.ix ?? 128,
      segment.c1 ?? 128,
      segment.c2 ?? 128,
      segment.c3 ?? 16,
      segment.o1 ? 1 : 0,
      segment.o2 ? 1 : 0,
      segment.o3 ? 1 : 0,
      segment.si ?? 0,
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
    latestPayload = pending.shift();
  }
  if (latestPayload) {
    const payload = JSON.stringify({ type: "frame", source: "cpp_harness", streamId, frame, rgb: latestPayload.rgb, leds: latestPayload.leds });
    if (frameSocket?.readyState === WebSocket.OPEN && frameSocket.bufferedAmount < 64 * 1024) {
      try {
        frameSocket.send(payload);
      } catch (error) {
        console.error(error.message);
        frameSocket.close();
        postFrame(payload);
      }
    } else {
      postFrame(payload);
    }
  }
  frame += 1;
}

function postFrame(payload) {
  fetch(`${server}/api/emulator/frame`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  }).catch((error) => console.error(error.message));
}

function isFreshAudio(audio, now) {
  return Number.isFinite(audio?.updatedAt) && now - audio.updatedAt < audioTimeoutMs;
}

console.log(`Streaming C++ effect frames to ${server}/emulator`);
const interval = setInterval(tick, 16);

process.on("SIGINT", () => {
  clearInterval(interval);
  frameSocket?.close();
  effect.kill("SIGINT");
  process.exit(0);
});
