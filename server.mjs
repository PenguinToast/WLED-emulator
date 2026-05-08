import { createServer } from "node:http";

import { port } from "./src/server/config.mjs";
import { createAppContext } from "./src/server/context.mjs";
import { handleHttp } from "./src/server/http.mjs";
import { handleUpgrade } from "./src/server/websocket.mjs";

const ctx = createAppContext();
const server = createServer((req, res) => handleHttp(req, res, ctx));

server.on("upgrade", (req, socket) => handleUpgrade(req, socket, ctx));
server.listen(port, () => {
  console.log(`EDC WLED emulator listening on http://localhost:${port}`);
  console.log(`WLED UI:      http://localhost:${port}/`);
  console.log(`LED emulator: http://localhost:${port}/emulator`);
});

