// Writes .br and .gz next to text assets in dist/ so the server can send them precompressed.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TEXT = /\.(js|css|html|svg|json|txt|webmanifest)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let count = 0;
for (const file of walk(DIST)) {
  if (!TEXT.test(file)) continue;
  const data = readFileSync(file);
  if (data.length < 1024) continue;
  writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
  writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
  count += 1;
}
console.log(`precompressed ${count} files`);
