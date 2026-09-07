import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const base = "node_modules/pdfjs-dist";
const version = JSON.parse(
  readFileSync(join(base, "package.json"), "utf8"),
).version;
const target = `public/pdfjs/${version}`;
mkdirSync(target, { recursive: true });
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(join(base, folder), join(target, folder), { recursive: true });
}
cpSync(join(base, "LICENSE"), join(target, "LICENSE"));
