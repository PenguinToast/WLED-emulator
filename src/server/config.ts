import { join } from "node:path";

export const rootDir = process.cwd();
export const publicDir = join(rootDir, "public");
export const wledDir = join(publicDir, "wled");
export const emulatorDir = join(publicDir, "emulator");
export const builtEmulatorDir = join(rootDir, "dist/emulator");
export const builtEmulatorHtmlDir = join(builtEmulatorDir, "public/emulator");
export const vendorWledDir = join(rootDir, "vendor/wled-0.15.4");
export const localStateDir = join(rootDir, ".edc-emulator");
export const versionInfoPath = join(localStateDir, "version-info.json");
export const edcUsermodConfigPath = join(localStateDir, "edc-usermod.json");
export const port = Number(process.env.PORT || 5173);
export const emulatorVersion = "0.15.4-emulator";
