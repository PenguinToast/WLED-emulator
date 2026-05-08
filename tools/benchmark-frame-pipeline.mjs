import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const server = process.env.WLED_EMULATOR_URL || "http://127.0.0.1:5173";
const binary = process.env.CPP_EFFECT_BINARY || "/tmp/edc-wled-cpp-effect";
const rawFrames = Number(process.env.RAW_FRAMES || 1000);
const streamMs = Number(process.env.STREAM_MS || 5000);

const state = await fetch(`${server}/api/emulator/state`).then((res) => res.json());
const raw = existsSync(binary) ? await benchmarkRawCpp(state) : { benchmark: "raw_cpp_process", skipped: `${binary} does not exist` };
const stream = await benchmarkFrameStream();

console.log(JSON.stringify({ server, raw, stream }, null, 2));
process.exit(0);

async function benchmarkRawCpp(emulatorState) {
  const segments = emulatorState.state.seg?.length ? emulatorState.state.seg : [];
  const audio = emulatorState.audio || {};
  const startedAt = Date.now();
  const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });
  let written = 0;
  let received = 0;
  let buffered = "";
  const started = process.hrtime.bigint();

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      let newline;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        buffered = buffered.slice(newline + 1);
        received += 1;
        if (received === rawFrames) {
          const elapsedMs = elapsedSince(started);
          child.kill("SIGINT");
          resolve({
            benchmark: "raw_cpp_process",
            frames: rawFrames,
            segments: segments.length,
            leds: emulatorState.info.leds.count,
            elapsedMs: Math.round(elapsedMs),
            fps: Math.round(rawFrames / (elapsedMs / 1000)),
          });
        }
      }
    });
    child.on("exit", (code) => {
      if (received < rawFrames && code !== 0 && code !== null) reject(new Error(`C++ effect exited with ${code}`));
    });
    pump();
  });

  function pump() {
    while (written < rawFrames) {
      if (!child.stdin.write(inputLine(written))) {
        child.stdin.once("drain", pump);
        return;
      }
      written += 1;
    }
    child.stdin.end();
  }

  function inputLine(frame) {
    const bins = Array.isArray(audio.bins) ? audio.bins.slice(0, 16) : [];
    while (bins.length < 16) bins.push(0);
    const fields = [
      ((startedAt + frame * 16 - startedAt) / 1000).toFixed(3),
      frame,
      emulatorState.state.bri ?? 180,
      segments.length,
      audio.volume ?? 0,
      audio.bass ?? 0,
      audio.mid ?? 0,
      audio.treble ?? 0,
      audio.beat ? 1 : 0,
      audio.bpm ?? 0,
      bins.length,
      ...bins,
    ];
    for (const [index, segment] of segments.entries()) {
      fields.push(
        segment.id ?? index,
        segment.start ?? 0,
        segment.stop ?? (segment.start ?? 0) + (segment.len ?? 1),
        segment.bri ?? 255,
        segment.fx ?? 9,
        segment.sx ?? 128,
        segment.ix ?? 128,
        segment.pal ?? 0,
        emulatorState.state.on && segment.on ? 1 : 0,
      );
      const colors = Array.isArray(segment.col) ? segment.col : [];
      for (let colorIndex = 0; colorIndex < 3; colorIndex += 1) {
        const color = Array.isArray(colors[colorIndex]) ? colors[colorIndex] : [0, 0, 0];
        fields.push(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0);
      }
    }
    return `${fields.join(" ")}\n`;
  }
}

function benchmarkFrameStream() {
  const wsUrl = `${server.replace(/^http/, "ws")}/api/emulator/frames`;
  const started = process.hrtime.bigint();
  let busMessages = 0;
  let frameMessages = 0;
  let audioMessages = 0;
  let rgbFrames = 0;
  let ledFrames = 0;
  let firstFrame = null;
  let lastFrame = null;
  let firstUpdatedAt = null;
  let lastUpdatedAt = null;
  let previousMessageAt = 0;
  let minInterMessageMs = Infinity;
  let maxInterMessageMs = 0;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      const now = Date.now();
      const frame = JSON.parse(event.data);
      busMessages += 1;
      if (frame.type === "audio") {
        audioMessages += 1;
        return;
      }
      if (frame.type !== "frame") return;
      frameMessages += 1;
      if (typeof frame.rgb === "string" && frame.rgb.length) rgbFrames += 1;
      if (Array.isArray(frame.leds) && frame.leds.length) ledFrames += 1;
      if (firstFrame === null) firstFrame = frame.frame;
      if (firstUpdatedAt === null) firstUpdatedAt = frame.updatedAt;
      lastFrame = frame.frame;
      lastUpdatedAt = frame.updatedAt;
      if (previousMessageAt) {
        const delta = now - previousMessageAt;
        minInterMessageMs = Math.min(minInterMessageMs, delta);
        maxInterMessageMs = Math.max(maxInterMessageMs, delta);
      }
      previousMessageAt = now;
    };
    ws.onerror = () => reject(new Error(`Could not connect to ${wsUrl}`));
    ws.onopen = () => {
      setTimeout(() => {
        const elapsedMs = elapsedSince(started);
        ws.close();
        resolve({
          benchmark: "frame_ws_receive",
          busMessages,
          audioMessages,
          frameMessages,
          elapsedMs: Math.round(elapsedMs),
          frameMessageFps: Math.round(frameMessages / (elapsedMs / 1000)),
          firstFrame,
          lastFrame,
          sourceFrameFps: firstFrame === null ? 0 : Math.round((lastFrame - firstFrame) / (elapsedMs / 1000)),
          rgbFrames,
          ledFrames,
          minInterMessageMs: Number.isFinite(minInterMessageMs) ? minInterMessageMs : null,
          maxInterMessageMs: maxInterMessageMs || null,
          serverUpdatedAtSpanMs: lastUpdatedAt - firstUpdatedAt,
        });
      }, streamMs);
    };
  });
}

function elapsedSince(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}
