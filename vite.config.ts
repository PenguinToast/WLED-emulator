import { defineConfig } from "vite";

import { wledEmulatorPlugin } from "./src/server/vite-plugin.js";

export default defineConfig({
  base: "/emulator/",
  publicDir: false,
  plugins: [wledEmulatorPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist/emulator",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        emulator: "public/emulator/index.html",
        audioCapture: "public/emulator/audio-capture.html",
        liveview: "public/emulator/liveview.html",
      },
    },
  },
});
