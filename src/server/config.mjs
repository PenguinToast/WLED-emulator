import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = fileURLToPath(new URL("../../", import.meta.url));
export const publicDir = join(rootDir, "public");
export const wledDir = join(publicDir, "wled");
export const emulatorDir = join(publicDir, "emulator");
export const vendorWledDir = join(rootDir, "vendor/wled-0.15.4");
export const port = Number(process.env.PORT || 5173);

