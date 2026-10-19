/**
 * Packs the Marketplace artifact: tango-<version>.zip containing
 * manifest.json + README.md + icon.png + dist/ (self-contained bundle, no
 * node_modules — see scripts/bundle.mjs).
 *
 * ponytail: implemented as a minimal STORE-mode zip writer so packaging
 * works everywhere from `node` alone (no shell zip / Compress-Archive).
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8'));
const outZip = path.join(pluginRoot, 'artifacts', `tango-${manifest.version}.zip`);

const files = [
  { src: path.join(pluginRoot, 'manifest.json'), name: 'manifest.json' },
  { src: path.join(pluginRoot, 'README.md'), name: 'README.md' },
  { src: path.join(pluginRoot, 'icon.png'), name: 'icon.png' },
  { src: path.join(pluginRoot, 'dist', 'index.js'), name: 'dist/index.js' },
  { src: path.join(pluginRoot, 'dist', 'index.js.map'), name: 'dist/index.js.map' },
];
for (const f of files) {
  if (!fs.existsSync(f.src)) throw new Error(`missing file for package: ${f.src}`);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

const chunks = [];
const central = [];
let offset = 0;
for (const file of files) {
  const data = fs.readFileSync(file.src);
  const crc = crc32(data);
  const { time, date } = dosDateTime(fs.statSync(file.src).mtime);
  const name = Buffer.from(file.name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // store
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, name, data);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4); // version made by
  dir.writeUInt16LE(20, 6); // version needed
  dir.writeUInt16LE(0, 8);
  dir.writeUInt16LE(0, 10);
  dir.writeUInt16LE(time, 12);
  dir.writeUInt16LE(date, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(data.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt16LE(0, 30);
  dir.writeUInt16LE(0, 32);
  dir.writeUInt16LE(0, 34);
  dir.writeUInt16LE(0, 36);
  dir.writeUInt32LE(0, 38);
  dir.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([dir, name]));

  offset += local.length + name.length + data.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.mkdirSync(path.dirname(outZip), { recursive: true });
fs.writeFileSync(outZip, Buffer.concat([...chunks, centralBuf, end]));
const size = fs.statSync(outZip).size;
console.log(`packaged ${outZip} (${size} bytes, sha256 ${crypto.createHash('sha256').update(fs.readFileSync(outZip)).digest('hex').slice(0, 16)}…)`);
