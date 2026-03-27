import { statSync, readdirSync } from "fs";
import { resolve } from "path";
import { brotliCompressSync, gzipSync } from "zlib";
import { readFileSync } from "fs";

const DIST_DIR = resolve("dist");
const MAX_GZIP_KB = 50;

interface FileReport {
  file: string;
  rawKb: number;
  gzipKb: number;
  brotliKb: number;
  ok: boolean;
}

function kb(bytes: number) {
  return (bytes / 1024).toFixed(2);
}

const files = readdirSync(DIST_DIR).filter(
  (f) => f.endsWith(".js") || f.endsWith(".mjs") || f.endsWith(".cjs")
);

if (files.length === 0) {
  console.error("No built files found in dist/. Run npm run build first.");
  process.exit(1);
}

console.log("\nBundle size report\n");
console.log(
  `${"File".padEnd(30)} ${"Raw".padStart(8)} ${"Gzip".padStart(8)} ${"Brotli".padStart(8)} ${"Status".padStart(8)}`
);
console.log("─".repeat(70));

const reports: FileReport[] = [];

for (const file of files) {
  const content = readFileSync(resolve(DIST_DIR, file));
  const raw = content.byteLength;
  const gzipped = gzipSync(content, { level: 9 }).byteLength;
  const brotli = brotliCompressSync(content).byteLength;
  const gzipKb = gzipped / 1024;
  const ok = gzipKb <= MAX_GZIP_KB;

  reports.push({
    file,
    rawKb: raw / 1024,
    gzipKb,
    brotliKb: brotli / 1024,
    ok,
  });

  const status = ok ? "✓ OK" : `✗ >${MAX_GZIP_KB}kb`;
  console.log(
    `${file.padEnd(30)} ${(kb(raw) + " kb").padStart(8)} ${(kb(gzipped) + " kb").padStart(8)} ${(kb(brotli) + " kb").padStart(8)} ${status.padStart(8)}`
  );
}

console.log("─".repeat(70));

const anyFailed = reports.some((r) => !r.ok);
const largest = reports.reduce((a, b) => (a.gzipKb > b.gzipKb ? a : b));

console.log(`\nLargest (gzipped): ${largest.file} — ${kb(largest.gzipKb * 1024)} kb`);
console.log(`Limit            : ${MAX_GZIP_KB} kb gzipped`);

if (anyFailed) {
  console.log(`\n✗ Bundle size check FAILED — reduce imports or split the package\n`);
  process.exit(1);
} else {
  console.log(`\n✓ Bundle size check passed\n`);
}