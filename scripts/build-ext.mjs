// Bundles the extension: background and popup as ES modules, the content script as one IIFE
// (content scripts can't import), plus the ONNX Runtime wasm files the model needs offline.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const out = "dist/ext";
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "ort"), { recursive: true });

const common = { bundle: true, target: "chrome124", minify: true, sourcemap: false, logLevel: "info", legalComments: "none" };
await build({ ...common, entryPoints: { background: "src/ext/background.ts", popup: "src/ext/popup.ts", offscreen: "src/ext/offscreen.ts" }, outdir: out, format: "esm" });
await build({ ...common, entryPoints: { content: "src/ext/content.ts" }, outdir: out, format: "iife" });

copyFileSync("src/ext/manifest.json", join(out, "manifest.json"));
copyFileSync("src/ext/popup.html", join(out, "popup.html"));
writeFileSync(join(out, "offscreen.html"), '<!doctype html><meta charset="utf-8"><title>Catch model</title><script type="module" src="./offscreen.js"></script>\n');

// onnxruntime-web doesn't export its dist folder, so find it in pnpm's store directly.
const store = "node_modules/.pnpm";
const ortPkg = readdirSync(store).filter((d) => d.startsWith("onnxruntime-web@")).sort().at(-1);
if (!ortPkg) throw new Error("onnxruntime-web not installed");
const ortDist = join(store, ortPkg, "node_modules/onnxruntime-web/dist");
for (const f of readdirSync(ortDist)) {
  if (/^ort-wasm-simd-threaded\.(jsep|asyncify)?\.?(wasm|mjs)$/.test(f)) copyFileSync(join(ortDist, f), join(out, "ort", f));
}

// A 128px amber circle, so the toolbar icon is not the default puzzle piece.
function png(size, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2, dy = y - size / 2;
      const inside = Math.hypot(dx, dy) < size * 0.46;
      row.push(...(inside ? [r, g, b] : [255, 251, 235]));
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
writeFileSync(join(out, "icon128.png"), png(128, [245, 158, 11]));
console.log(`extension built in ${out}`);
