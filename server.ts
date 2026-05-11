import { createServer } from "node:http";

import { port } from "./src/server/config.js";
import { createAppContext } from "./src/server/context.js";
import { handleHttp } from "./src/server/http.js";
import { handleFrameUpgrade, handleUpgrade } from "./src/server/websocket.js";

const ctx = createAppContext();
const server = createServer((req, res) => handleHttp(req, res, ctx));

server.on("upgrade", (req, socket) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (pathname === "/ws") handleUpgrade(req, socket, ctx);
  else if (pathname === "/api/emulator/frames") handleFrameUpgrade(req, socket, ctx);
  else socket.destroy();
});
server.listen(port, () => {
  console.log(`EDC WLED emulator listening on http://localhost:${port}`);
  console.log(`WLED UI:      http://localhost:${port}/`);
  console.log(`LED emulator: http://localhost:${port}/emulator`);
});
