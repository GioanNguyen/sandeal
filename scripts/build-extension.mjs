/**
 * Đóng gói tiện ích Chrome: node scripts/build-extension.mjs
 * - Ghi SITE_URL (từ .env hoặc biến môi trường) làm máy chủ mặc định
 * - Xuất public/downloads/san-deal-extension.zip để trang /tien-ich cho tải về
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envFile = path.join(root, ".env");
let site = process.env.SITE_URL;
if (!site && fs.existsSync(envFile)) site = fs.readFileSync(envFile, "utf8").match(/^SITE_URL="?([^"\n]*)"?/m)?.[1];
site = (site || "http://localhost:3000").replace(/\/$/, "");

const srcDir = path.join(root, "extension");
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(srcDir);

const entries = files.map((full) => {
  const name = path.relative(srcDir, full).split(path.sep).join("/");
  let data = fs.readFileSync(full);
  if (name === "config.js") data = Buffer.from(`self.SAN_DEAL_DEFAULT_SERVER = ${JSON.stringify(site)};\n`);
  if (name === "manifest.json") {
    const m = JSON.parse(data.toString());
    const origin = new URL(site);
    const own = `${origin.protocol}//${origin.host}/*`;
    // Bản cho site thật chỉ xin quyền đúng tên miền của site (bỏ localhost dùng khi phát triển)
    const isLocal = ["localhost", "127.0.0.1"].includes(origin.hostname);
    m.host_permissions = isLocal ? [...new Set([own, ...m.host_permissions])] : [own];
    data = Buffer.from(JSON.stringify(m, null, 2));
  }
  return { name, data };
});

// --- ZIP tối giản (deflate) ---
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const locals = [], centrals = [];
let offset = 0;
for (const { name, data } of entries) {
  const nameBuf = Buffer.from(name, "utf8");
  const comp = zlib.deflateRawSync(data);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10); central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
  locals.push(local, nameBuf, comp);
  centrals.push(central, nameBuf);
  offset += local.length + nameBuf.length + comp.length;
}
const cdSize = centrals.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);

const outDir = path.join(root, "public", "downloads");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "san-deal-extension.zip");
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`[extension] ${entries.length} file -> ${path.relative(root, out)} (máy chủ: ${site})`);
