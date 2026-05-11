import { createHash } from "node:crypto";

import { audioMessage, updateAudioState } from "./audio-state.js";
import { applyStateUpdate, renderPreviewLeds } from "./device-state.js";
import { siJson } from "./wled-json.js";

const partialFrames = new WeakMap();
const MAX_WS_PARTIAL_BYTES = 1024 * 1024;

export function handleUpgrade(req, socket, ctx) {
  if (!acceptWebSocket(req, socket)) return;
  ctx.sockets.add(socket);
  sendWs(socket, siJson(ctx));
  socket.on("data", (buffer) => handleWsData(socket, buffer, ctx));
  socket.on("close", () => removeSocket(ctx.sockets, socket));
  socket.on("error", () => removeSocket(ctx.sockets, socket));
}

export function handleFrameUpgrade(req, socket, ctx) {
  if (!acceptWebSocket(req, socket)) return;
  ctx.frameSockets.add(socket);
  if (externalFrameLedCount(ctx.externalFrame)) sendWs(socket, frameMessage(ctx.externalFrame));
  sendWs(socket, audioMessage(ctx.audio));
  socket.on("data", (buffer) => handleFrameData(socket, buffer, ctx));
  socket.on("close", () => removeSocket(ctx.frameSockets, socket));
  socket.on("error", () => removeSocket(ctx.frameSockets, socket));
}

function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return false;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 15000);
  return true;
}

export function broadcast(ctx, value) {
  for (const socket of ctx.sockets) {
    if (!sendWs(socket, value)) removeSocket(ctx.sockets, socket);
  }
}

export function updateExternalFrame(ctx, value, excludeSocket = null) {
  const frame = Number(value?.frame ?? -1);
  const streamId = String(value?.streamId || value?.source || "external");
  const sameStream = streamId === (ctx.externalFrame.streamId || ctx.externalFrame.source);
  if (sameStream && Number.isFinite(frame) && frame >= 0 && frame < (ctx.externalFrame.frame ?? -1)) {
    return false;
  }
  const rgb = typeof value?.rgb === "string" ? normalizeFrameHex(value.rgb) : "";
  ctx.externalFrame = {
    leds: Array.isArray(value?.leds) ? value.leds : [],
    rgb,
    updatedAt: Date.now(),
    source: String(value?.source || "external"),
    frame: Number.isFinite(frame) ? frame : (ctx.externalFrame.frame ?? 0) + 1,
    streamId,
  };
  for (const socket of ctx.frameSockets) {
    if (socket === excludeSocket) continue;
    if (!sendWs(socket, frameMessage(ctx.externalFrame))) removeSocket(ctx.frameSockets, socket);
  }
  return true;
}

export function frameMessage(frame) {
  return {
    type: "frame",
    leds: frame.leds,
    rgb: frame.rgb,
    updatedAt: frame.updatedAt,
    source: frame.source,
    frame: frame.frame,
    streamId: frame.streamId,
  };
}

export function externalFrameLedCount(frame) {
  if (Array.isArray(frame?.leds) && frame.leds.length) return frame.leds.length;
  if (typeof frame?.rgb === "string") return Math.floor(frame.rgb.length / 6);
  return 0;
}

function normalizeFrameHex(value) {
  return value.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

function handleWsData(socket, buffer, ctx) {
  const messages = decodeWs(socket, buffer);
  for (const message of messages) {
    if (!message) continue;
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      continue;
    }
    if (data.lv === true) {
      sendWs(socket, { leds: renderPreviewLeds(ctx.state) });
      continue;
    }
    if (data.lv === false) continue;
    applyStateUpdate(ctx.state, data, ctx.catalog);
    broadcast(ctx, siJson(ctx));
    if (data.v) sendWs(socket, siJson(ctx));
  }
}

function handleFrameData(socket, buffer, ctx) {
  const messages = decodeWs(socket, buffer);
  for (const message of messages) {
    try {
      const data = JSON.parse(message);
      if (data?.type === "audio") {
        updateAudioState(ctx, data);
        for (const frameSocket of ctx.frameSockets) {
          if (frameSocket === socket) continue;
          if (!sendWs(frameSocket, audioMessage(ctx.audio))) removeSocket(ctx.frameSockets, frameSocket);
        }
      } else if (data?.type === "frame") {
        updateExternalFrame(ctx, data, socket);
      }
    } catch {
      // Ignore malformed frame payloads.
    }
  }
}

function decodeWs(socket, chunk) {
  const previous = partialFrames.get(socket);
  const buffer = previous?.length ? Buffer.concat([previous, chunk]) : chunk;
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const frameStart = offset;
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    if (length === 126) {
      if (offset + 2 > buffer.length) return rememberPartial(socket, buffer, frameStart, messages);
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) return rememberPartial(socket, buffer, frameStart, messages);
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const masked = (second & 0x80) !== 0;
    if (masked && offset + 4 > buffer.length) return rememberPartial(socket, buffer, frameStart, messages);
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    if (masked) offset += 4;
    if (offset + length > buffer.length) return rememberPartial(socket, buffer, frameStart, messages);
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    if (opcode === 8) {
      sendWsControl(socket, 0x8, payload);
      socket.end();
      partialFrames.delete(socket);
      return messages;
    }
    if (opcode === 9) {
      sendWsControl(socket, 0xA, payload);
      continue;
    }
    if (opcode === 10) continue;
    if (opcode !== 1) continue;
    messages.push(payload.toString("utf8"));
  }
  if (offset < buffer.length) partialFrames.set(socket, buffer.subarray(offset));
  else partialFrames.delete(socket);
  return messages;
}

function rememberPartial(socket, buffer, frameStart, messages) {
  const partial = buffer.subarray(frameStart);
  if (partial.length > MAX_WS_PARTIAL_BYTES) {
    partialFrames.delete(socket);
    socket.destroy();
  } else {
    partialFrames.set(socket, partial);
  }
  return messages;
}

function sendWs(socket, value) {
  if (socket.destroyed || !socket.writable) return false;
  const payload = Buffer.from(JSON.stringify(value));
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
    return true;
  } catch {
    socket.destroy();
    return false;
  }
}

function sendWsControl(socket, opcode, payload = Buffer.alloc(0)) {
  if (socket.destroyed || !socket.writable) return false;
  const safePayload = Buffer.from(payload.subarray(0, 125));
  try {
    socket.write(Buffer.concat([Buffer.from([0x80 | opcode, safePayload.length]), safePayload]));
    return true;
  } catch {
    socket.destroy();
    return false;
  }
}

function removeSocket(set, socket) {
  set.delete(socket);
  partialFrames.delete(socket);
}
