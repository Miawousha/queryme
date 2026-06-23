import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { svgAssets, pngAssets } from "../lib/brand/badge-assets";

const root = fileURLToPath(new URL("..", import.meta.url));

function write(rel: string, data: string | Uint8Array): void {
  const abs = resolve(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  console.log(`  ✓ ${rel}`);
}

console.log("Building Queritae badge assets…");
for (const a of svgAssets()) write(a.file, a.svg);
for (const a of pngAssets()) {
  const png = new Resvg(a.svg, { fitTo: { mode: "width", value: a.width } }).render().asPng();
  write(a.file, png);
}
console.log("Done.");
