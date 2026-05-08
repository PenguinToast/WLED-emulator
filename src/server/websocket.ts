import { createHash } from "node:crypto";

import { applyStateUpdate, renderPreviewLeds } from "./device-state.js";
import { siJson } from "./wled-json.js";

export function handleUpgrade(req, socket, ctx) {
  if (new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
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
  ctx.sockets.add(socket);
  sendWs(socket, siJson(ctx));
  socket.on("data", (buffer) => handleWsData(socket, buffer, ctx));
  socket.on("close", () => ctx.sockets.delete(socket));
  socket.on("error", () => ctx.sockets.delete(socket));
}

export function broadcast(ctx, value) {
  for (const socket of ctx.sockets) sendWs(socket, value);
}

function handleWsData(socket, buffer, ctx) {
  const messages = decodeWs(buffer);
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

function decodeWs(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const masked = (second & 0x80) !== 0;
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    if (masked) offset += 4;
    if (offset + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
    if (opcode === 8) return messages;
    if (opcode !== 1) continue;
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    messages.push(payload.toString("utf8"));
  }
  return messages;
}

function sendWs(socket, value) {
  if (socket.destroyed) return;
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
  socket.write(Buffer.concat([header, payload]));
}

