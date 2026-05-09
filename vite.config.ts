import { defineConfig } from "vite";

export default defineConfig({
  base: "/emulator/",
  publicDir: false,
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
