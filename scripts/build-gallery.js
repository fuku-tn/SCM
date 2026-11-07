#!/usr/bin/env node
/**
 * Tạo project "Gallery": mỗi mẫu trong component-library/ được gắn vào cột/measure THẬT của một project PBIP đã build,
 * xếp lên các trang (6 mẫu/trang) để mở thử trong Power BI Desktop.
 *
 *   node scripts/build-gallery.js <thư-mục-project-pbip-đã-build> [thư-mục-ra]
 *
 * Mặc định ghi vào <project>/../Gallery_<tên>. Ghi kèm GALLERY.md: bảng "mẫu → trang → ô" để báo lại mẫu nào lỗi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../lib/components.js');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TPLID = (process.argv.find((a) => a.startsWith('--template=')) || '').slice(11);
const src = args[0];
if (!src || !fs.existsSync(src)) { console.error('Usage: node scripts/build-gallery.js <project-pbip> [out]'); process.exit(2); }
const lib = path.join(__dirname, '..', 'component-library');
if (!fs.existsSync(path.join(lib, 'index.json'))) { console.error('Chưa có component-library — chạy: node scripts/build-components.js'); process.exit(2); }

// ---- đọc mô hình (TMDL) ----
const unq = (s) => { s = s.trim(); if (s[0] === "'") { let o = '', i = 1; for (; i < s.length; i++) { if (s[i] === "'") { if (s[i + 1] === "'") { o += "'"; i++; } else break; } else o += s[i]; } return o; } return (s.match(/^[^\s=:]+/) || [''])[0]; };
const smDir = fs.readdirSync(src).find((f) => f.endsWith('.SemanticModel'));
const repDir = fs.readdirSync(src).find((f) => f.endsWith('.Report'));
const pbip = fs.readdirSync(src).find((f) => f.endsWith('.pbip'));
if (!smDir || !repDir || !pbip) { console.error('Không phải project PBIP hợp lệ: ' + src); process.exit(2); }
const tdir = path.join(src, smDir, 'definition', 'tables');
const tables = [];
for (const f of fs.readdirSync(tdir).filter((x) => x.endsWith('.tmdl'))) {
  const lines = fs.readFileSync(path.join(tdir, f), 'utf8').split(/\r?\n/);
  const t = { name: '', columns: [], measures: [] }; let cur = null;
  for (const l of lines) {
    let m;
    if ((m = l.match(/^table\s+(.+)$/))) t.name = unq(m[1]);
    else if ((m = l.match(/^\tcolumn\s+(.+)$/))) { cur = { name: unq(m[1].replace(/\s*=.*$/, m[1][0] === "'" ? '' : '')), type: '' }; t.columns.push(cur); }
    else if ((m = l.match(/^\tmeasure\s+(.+)$/))) { t.measures.push(unq(m[1])); cur = null; }
    else if ((m = l.match(/^\t\tdataType:\s*(\S+)/)) && cur) cur.type = m[1];
    else if (/^\t[a-z]/.test(l) && !/^\t(column|measure)/.test(l)) cur = null;
  }
  tables.push(t);
}
const facts = tables.filter((t) => t.measures.length);
const measures = tables.flatMap((t) => t.measures.map((n) => ({ table: t.name, name: n })));
const textCols = tables.flatMap((t) => t.columns.filter((c) => c.type === 'string' && !/^(mã|ma|id|code)\b|\bid$/i.test(c.name) && t.name !== 'Calendar').map((c) => ({ table: t.name, name: c.name })));
const idCols = tables.flatMap((t) => t.columns.filter((c) => c.type === 'string' || c.type === 'int64').map((c) => ({ table: t.name, name: c.name })));
const numCols = tables.flatMap((t) => t.columns.filter((c) => /int64|double|decimal/.test(c.type) && t.name !== 'Calendar').map((c) => ({ table: t.name, name: c.name })));
const dateCols = tables.flatMap((t) => t.columns.filter((c) => c.type === 'dateTime').map((c) => ({ table: t.name, name: c.name })));
if (!measures.length || !textCols.length) { console.error('Project cần có ít nhất 1 measure và 1 cột văn bản'); process.exit(2); }

// ---- chọn trường cho từng slot ----
let mi = 0, ti = 0;
function pick(slot, role, i, used) {
  if (slot.extra && slot.kind === 'measure') { // dòng so sánh dưới số KPI: ưu tiên measure cùng loại (YoY/MoM/QoQ/DoD/%) với bản gốc
    const key = ['YoY', 'MoM', 'QoQ', 'DoD', '%'].find((k) => (slot.hint || '').includes(k));
    const m = (key && measures.find((x) => x.name.includes(key))) || measures[(mi++) % measures.length]; return { ...m, kind: 'measure' };
  }
  if (slot.kind === 'hierarchy') return dateCols[0] ? { ...dateCols[0], kind: 'column' } : textCols[0];
  if (slot.agg !== undefined) { // Count/Sum… trên cột
    const isCount = [2, 5].includes(slot.agg);
    const pool = isCount ? idCols : (numCols.length ? numCols : idCols); const c = pool[(mi++) % pool.length]; return { ...c, kind: 'column' };
  }
  if (slot.kind === 'measure') { const m = measures[(mi++) % measures.length]; return { ...m, kind: 'measure' }; }
  const c = textCols[(ti++) % textCols.length]; return { ...c, kind: 'column' };
}

// ---- ra project ----
const out = args[1] || path.join(path.dirname(src), 'Gallery_' + path.basename(src));
fs.rmSync(out, { recursive: true, force: true }); fs.cpSync(src, out, { recursive: true });
// Gallery tự chứa: DataFolder trỏ về thư mục data cạnh nó (giống SetDataFolder.ps1)
if (fs.existsSync(path.join(out, 'data'))) {
  const ex = path.join(out, smDir, 'definition', 'expressions.tmdl');
  if (fs.existsSync(ex)) {
    const t = fs.readFileSync(ex, 'utf8'); const abs = path.resolve(out, 'data').replace(/"/g, '""');
    fs.writeFileSync(ex, t.replace(/^(expression DataFolder = ")[^"]*(")/m, (m, a, b) => a + abs + b), 'utf8');
  }
}
const pdir = path.join(out, repDir, 'definition', 'pages');
fs.rmSync(pdir, { recursive: true, force: true }); fs.mkdirSync(pdir, { recursive: true });

const TPL = require('../lib/pbix-template.js');
if (!TPLID) { console.error('Thiếu --template=<id> (vd. --template=sale hoặc --template=hr): mỗi template có theme/nền riêng nên Gallery làm riêng từng cái'); process.exit(2); }
const tpl = TPL.loadTemplate(TPLID); if (!tpl) { console.error('Không có template ' + TPLID); process.exit(2); }
const index = JSON.parse(fs.readFileSync(path.join(lib, 'index.json'), 'utf8')).components.filter((c) => c.status === 'PASS' && c.template === TPLID);
const srcPage = (no) => { const p = tpl.manifest.pages[no - 1]; try { return JSON.parse(fs.readFileSync(path.join(tpl.dir, 'definition', 'pages', p.id, 'page.json'), 'utf8')); } catch { return {}; } };
const PER = 6, COLS = 3, W = 1280, H = 720, M = 20;

const hash = (s, n = 20) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n);
const order = []; const rows = []; let pageNo = 0;
// mỗi trang Gallery lấy nền (background), kích thước từ CHÍNH trang template mà mẫu vốn nằm trên → đúng nền/theme mà định dạng mẫu được thiết kế cho
const sorted = index.slice().sort((a, b) => a.page - b.page || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
const batches = [];
for (const c of sorted) { const last = batches[batches.length - 1]; if (last && last.page === c.page && last.items.length < PER) last.items.push(c); else batches.push({ page: c.page, items: [c] }); }
for (const bt of batches) {
  pageNo++; const batch = bt.items; const pid = hash('gallery-page-' + pageNo);
  const sp = srcPage(bt.page); const PW = sp.width || W, PH = sp.height || H;
  const cw = (PW - M * (COLS + 1)) / COLS, ch = (PH - 60 - M * 3) / 2;
  order.push(pid); const types = [...new Set(batch.map((c) => c.type))];
  const dir = path.join(pdir, pid); fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true });
  const pageJson = { $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json', name: pid, displayName: `${tpl.name} · ${bt.page}. ${(batch[0].pageName || '').slice(0, 20)} · ${types.join(', ')}`.slice(0, 80), displayOption: sp.displayOption || 'FitToPage', height: PH, width: PW };
  if (sp.objects) pageJson.objects = sp.objects; // nền (ảnh/màu) của trang template
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify(pageJson, null, 2));
  batch.forEach((ci, k) => {
    const comp = JSON.parse(fs.readFileSync(path.join(lib, ci.file), 'utf8'));
    const fields = {};
    for (const [role, arr] of Object.entries(comp.roles)) fields[role] = arr.map((s, i) => pick(s, role, i));
    const col = k % COLS, row = Math.floor(k / COLS);
    const sc = Math.min(1, cw / comp.size.w, ch / comp.size.h);
    const w = Math.round(comp.size.w * sc), h = Math.round(comp.size.h * sc);
    const x = Math.round(M + col * (cw + M)), y = Math.round(60 + M + row * (ch + M));
    const name = hash('gallery-' + comp.id);
    const v = C.instantiate(comp, { name, x, y, w, h, z: k, tabOrder: k, fields });
    if (!v) { rows.push({ id: comp.id, type: comp.type, page: pageNo, cell: k + 1, note: 'không gắn được' }); return; }
    fs.mkdirSync(path.join(dir, 'visuals', name), { recursive: true });
    fs.writeFileSync(path.join(dir, 'visuals', name, 'visual.json'), JSON.stringify(v, null, 2));
    rows.push({ id: comp.id, type: comp.type, page: pageNo, cell: k + 1, size: `${w}×${h}`, fields: Object.entries(fields).map(([r, a]) => `${r}: ${a.map((f) => f.table + '.' + f.name).join(', ')}`).join('; ') });
  });
}
fs.writeFileSync(path.join(pdir, 'pages.json'), JSON.stringify({ $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json', pageOrder: order, activePageName: order[0] }, null, 2));

const md = ['# Gallery — thư viện thành phần gắn vào dữ liệu thật', '',
  `Mở \`${pbip}\` trong Power BI Desktop, bấm **Refresh** một lần. Mỗi trang có tối đa ${PER} mẫu (hàng 1: ô 1–3, hàng 2: ô 4–6, từ trái sang phải).`,
  'Hãy báo lại mẫu nào: (a) báo lỗi khi mở file, (b) trống/không hiện, (c) sai hình dạng so với template gốc — theo cột **Mẫu** bên dưới.', '',
  '| Trang | Ô | Loại | Mẫu | Kích thước | Trường đã gắn |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.page} | ${r.cell} | ${r.type} | \`${r.id}\` | ${r.size || '—'} | ${r.fields || r.note} |`), ''].join('\n');
fs.writeFileSync(path.join(out, 'GALLERY.md'), md, 'utf8');
console.log(`Gallery: ${rows.length} mẫu trên ${pageNo} trang → ${out}`);
