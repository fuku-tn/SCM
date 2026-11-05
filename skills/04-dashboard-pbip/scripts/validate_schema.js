#!/usr/bin/env node
/**
 * Đối chiếu các file JSON của project PBIP với JSON Schema chính thức của Microsoft
 * (https://github.com/microsoft/json-schemas). Cần kết nối mạng.
 *
 *   node validate_schema.js <thư mục project PBIP>
 *
 * Exit 0: tất cả hợp lệ · 1: có file sai schema · 3: không tải được schema (không có mạng)
 * Lưu ý: chỉ kiểm tra JSON (.pbip, .pbir, .pbism, report/page/visual...). TMDL không có schema công bố nên không kiểm tra ở đây.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const root = process.argv[2];
if (!root || !fs.existsSync(root)) { console.error('Usage: node validate_schema.js <pbipDir>'); process.exit(2); }

const MAP = (u) => u.replace('https://developer.microsoft.com/json-schemas/', 'https://raw.githubusercontent.com/microsoft/json-schemas/main/');
const cache = new Map();
async function load(uri) {
  if (cache.has(uri)) return cache.get(uri);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(MAP(uri), { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + uri);
    const j = await r.json();
    cache.set(uri, j);
    return j;
  } finally { clearTimeout(t); }
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

(async () => {
  const ajv = new Ajv({ allErrors: true, strict: false, loadSchema: load, validateFormats: false });
  const files = walk(root).filter((f) => /\.(json|pbip|pbir|pbism)$/i.test(f));
  let bad = 0, ok = 0, skipped = 0, offline = false;
  const compiled = new Map(), unpublished = new Set();
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!j.$schema) continue;
    try {
      if (!compiled.has(j.$schema)) compiled.set(j.$schema, await ajv.compileAsync(await load(j.$schema)));
      const v = compiled.get(j.$schema);
      if (v === null) { skipped++; continue; }
      if (v(j)) ok++;
      else {
        bad++;
        console.log('✗ ' + rel);
        v.errors.slice(0, 6).forEach((e) => console.log('    ' + (e.instancePath || '/') + ' ' + e.message + (e.params && e.params.additionalProperty ? ' [' + e.params.additionalProperty + ']' : '')));
      }
    } catch (e) {
      if (/HTTP 404/.test(e.message)) {
        // phiên bản schema do Power BI Desktop bản mới ghi, chưa có trong kho công khai → bỏ qua riêng loại file này
        if (!unpublished.has(j.$schema)) { unpublished.add(j.$schema); console.log('· schema chưa công bố trong kho Microsoft (Desktop mới hơn): ' + j.$schema.replace(/^.*definition\//, '')); }
        compiled.set(j.$schema, null); skipped++; continue;
      }
      offline = true; console.log('! ' + rel + ' — không kiểm tra được: ' + String(e.message).slice(0, 120)); break;
    }
  }
  if (offline) { console.log('Không tải được schema (không có mạng?) — bỏ qua bước kiểm tra schema.'); process.exit(3); }
  console.log('Schema Microsoft: ' + ok + ' file hợp lệ, ' + bad + ' file lỗi' + (skipped ? ' (' + skipped + ' file dùng schema mới hơn kho công khai nên không đối chiếu được)' : ''));
  process.exit(bad ? 1 : 0);
})();
