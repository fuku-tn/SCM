#!/usr/bin/env node
/**
 * Stage 3 · Data (ETL) — post.js
 * Chạy SAU lượt trả lời của model.
 *
 *   node post.js <runDir> <stageDir>
 *
 * - Đọc  model-spec.json do model viết (nếu có), đối chiếu với dữ liệu thật trong clean/*.csv và data-checks.json
 * - Loại bỏ / sửa phần không hợp lệ (bảng, cột, quan hệ không tồn tại; khóa khác kiểu...)
 * - Nếu model không viết model-spec.json → tự sinh bản mặc định từ kết quả kiểm tra quan hệ
 * - Ghi lại  model-spec.json  ở dạng CHUẨN để chặng Dashboard (PBIP) dùng để dựng semantic model.
 * - Exit 0 khi spec cuối cùng hợp lệ; exit 1 nếu không dựng nổi (không có bảng nào).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const runDir = process.argv[2], stageDir = process.argv[3];
if (!runDir || !stageDir) { console.error('Usage: node post.js <runDir> <stageDir>'); process.exit(2); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const checks = readJson(path.join(stageDir, 'data-checks.json'));
if (!checks || !checks.tables || !checks.tables.length) { console.error('Thiếu data-checks.json (pre.js chưa chạy hoặc không có bảng)'); process.exit(1); }
const run = readJson(path.join(runDir, 'run.json')) || {};
const warnings = [];
const warn = (m) => { warnings.push(m); console.log('⚠ ' + m); };
const ieq = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

let spec = readJson(path.join(stageDir, 'model-spec.json'));
if (!spec) { console.log('Model không cung cấp model-spec.json (hoặc JSON lỗi) → tự sinh bản mặc định từ kết quả kiểm tra.'); spec = {}; }

const TYPES = new Set(['int', 'decimal', 'text', 'date', 'datetime', 'bool']);
const byName = (name) => checks.tables.find((t) => ieq(t.name, name));
const colOf = (t, name) => t.columns.find((c) => ieq(c.name, name));
const relCand = (checks.relationships && checks.relationships.candidates) || [];

// ---------- bảng ----------
const specTables = Array.isArray(spec.tables) ? spec.tables : [];
const fkTables = new Set(relCand.map((c) => c.from.table));
const largest = checks.tables.slice().sort((a, b) => b.rowsAfter - a.rowsAfter)[0];
const tables = checks.tables.map((t) => {
  const given = specTables.find((x) => x && ieq(x.name, t.name)) || {};
  let role = ['fact', 'dimension'].includes(given.role) ? given.role : (fkTables.has(t.name) || t === largest ? 'fact' : 'dimension');
  if (checks.tables.length === 1) role = 'fact';
  const colOverrides = Array.isArray(given.columns) ? given.columns : [];
  const columns = t.columns.map((c) => {
    const o = colOverrides.find((x) => x && ieq(x.name, c.name)) || {};
    const isKey = /(^|\b|_)(id|ma|mã|code|key|sku)$/i.test(c.name.replace(/\s+/g, '')) || (c.unique && c.type === 'text');
    let summarizeBy = o.summarizeBy;
    if (!['none', 'sum', 'average', 'min', 'max', 'count'].includes(summarizeBy)) summarizeBy = (c.type === 'int' || c.type === 'decimal') && !isKey ? 'sum' : 'none';
    let type = c.type; // kiểu thật sau làm sạch là nguồn chân lý
    if (o.type && TYPES.has(o.type) && o.type !== c.type) warn(`Bỏ qua kiểu "${o.type}" model đặt cho ${t.name}.${c.name}: dữ liệu đã làm sạch là "${c.type}"`);
    return { name: c.name, type, summarizeBy, hidden: !!o.hidden || (isKey && role === 'fact' && /id$/i.test(c.name)) , format: o.format || null, description: o.description || '' };
  });
  if (given.name === undefined && specTables.length) warn(`Model không nhắc tới bảng "${t.name}" → dùng mặc định`);
  return { name: t.name, file: t.file.replace(/^clean\//, ''), role, rows: t.rowsAfter, columns };
});
for (const st of specTables) if (st && st.name && !byName(st.name)) warn(`Model khai báo bảng "${st.name}" nhưng không có trong dữ liệu đã làm sạch → bỏ qua`);

// ---------- quan hệ ----------
const relations = [];
const typeOf = (tn, cn) => { const t = tables.find((x) => ieq(x.name, tn)); const c = t && t.columns.find((x) => ieq(x.name, cn)); return c && c.type; };
const addRel = (r, source) => {
  const ft = tables.find((x) => ieq(x.name, r.fromTable)), tt = tables.find((x) => ieq(x.name, r.toTable));
  if (!ft || !tt) return warn(`Quan hệ (${source}) ${r.fromTable}→${r.toTable}: bảng không tồn tại → bỏ`);
  const fc = ft.columns.find((c) => ieq(c.name, r.fromColumn)), tc = tt.columns.find((c) => ieq(c.name, r.toColumn));
  if (!fc || !tc) return warn(`Quan hệ (${source}) ${r.fromTable}.${r.fromColumn}→${r.toTable}.${r.toColumn}: cột không tồn tại → bỏ`);
  if (ft === tt) return warn(`Quan hệ (${source}) nối bảng với chính nó → bỏ`);
  if (fc.type !== tc.type) return warn(`Quan hệ (${source}) ${ft.name}.${fc.name} (${fc.type}) ↔ ${tt.name}.${tc.name} (${tc.type}): khác kiểu → bỏ`);
  const dup = relations.find((x) => (x.fromTable === ft.name && x.toTable === tt.name) || (x.fromTable === tt.name && x.toTable === ft.name));
  if (dup) return warn(`Quan hệ (${source}) ${ft.name}↔${tt.name} trùng cặp bảng đã có → bỏ (tránh quan hệ mơ hồ)`);
  // phía "một" phải là phía duy nhất
  const cand = relCand.find((c) => ieq(c.from.table, ft.name) && ieq(c.to.table, tt.name) || ieq(c.from.table, tt.name) && ieq(c.to.table, ft.name));
  let card = r.cardinality;
  if (!['manyToOne', 'oneToOne', 'manyToMany', 'oneToMany'].includes(card)) card = cand ? cand.cardinality : 'manyToOne';
  relations.push({ fromTable: ft.name, fromColumn: fc.name, toTable: tt.name, toColumn: tc.name, cardinality: card === 'oneToMany' ? 'manyToOne' : card, crossFilter: r.crossFilter === 'both' ? 'both' : 'single', source });
  if (card === 'manyToMany') warn(`Quan hệ ${ft.name}.${fc.name}↔${tt.name}.${tc.name} là many-to-many → nên tạo bảng dimension trung gian`);
  if (cand && cand.issues && cand.issues.length) warn(`Quan hệ ${ft.name}.${fc.name}→${tt.name}.${tc.name} còn vấn đề: ${cand.issues.join('; ')}`);
};
if (Array.isArray(spec.relationships)) spec.relationships.forEach((r) => r && addRel(r, 'model'));
if (!Array.isArray(spec.relationships)) relCand.forEach((c) => addRel({ fromTable: c.from.table, fromColumn: c.from.column, toTable: c.to.table, toColumn: c.to.column, cardinality: c.cardinality }, 'auto'));
else if (!relations.length && relCand.length) { console.log('Model không có quan hệ hợp lệ → dùng ứng viên tự phát hiện.'); relCand.forEach((c) => addRel({ fromTable: c.from.table, fromColumn: c.from.column, toTable: c.to.table, toColumn: c.to.column, cardinality: c.cardinality }, 'auto')); }
if (tables.length > 1 && !relations.length) warn('Có nhiều bảng nhưng không có quan hệ nào được tạo — các bảng sẽ rời nhau trong mô hình');

// cột tham gia quan hệ = cột khóa: không cộng dồn; ở bảng fact thì ẩn (khóa ngoại), trừ khi model chủ động đặt khác
for (const r of relations) {
  for (const [tn, cn] of [[r.fromTable, r.fromColumn], [r.toTable, r.toColumn]]) {
    const t = tables.find((x) => x.name === tn), c = t.columns.find((x) => x.name === cn);
    const given = (specTables.find((x) => x && ieq(x.name, tn)) || {}).columns || [];
    const o = given.find((x) => x && ieq(x.name, cn)) || {};
    if (!o.summarizeBy) c.summarizeBy = 'none';
    if (o.hidden === undefined && t.role === 'fact' && tn === r.fromTable) c.hidden = true;
  }
}

// ---------- cột ngày ----------
let dateColumn = null;
if (spec.dateColumn && spec.dateColumn.table && spec.dateColumn.column) {
  const t = tables.find((x) => ieq(x.name, spec.dateColumn.table)); const c = t && t.columns.find((x) => ieq(x.name, spec.dateColumn.column));
  if (c && (c.type === 'date' || c.type === 'datetime')) dateColumn = { table: t.name, column: c.name };
  else warn(`dateColumn ${spec.dateColumn.table}.${spec.dateColumn.column} không phải cột ngày → tự chọn lại`);
}
if (!dateColumn) {
  const facts = tables.filter((t) => t.role === 'fact').concat(tables.filter((t) => t.role !== 'fact'));
  for (const t of facts) { const c = t.columns.find((x) => x.type === 'date' || x.type === 'datetime'); if (c) { dateColumn = { table: t.name, column: c.name }; break; } }
}
if (!dateColumn) console.log('Không có cột ngày → sẽ không tạo bảng Calendar / time intelligence.');

const out = {
  version: 1,
  modelName: String(spec.modelName || 'BIE_Model').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'BIE_Model',
  sourceFile: checks.sourceFile,
  tables, relationships: relations, dateColumn,
  notes: Array.isArray(spec.notes) ? spec.notes.map(String).slice(0, 20) : [],
  warnings,
};
fs.writeFileSync(path.join(stageDir, 'model-spec.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`model-spec.json: ${tables.length} bảng (${tables.filter((t) => t.role === 'fact').length} fact), ${relations.length} quan hệ, dateColumn=${dateColumn ? dateColumn.table + '.' + dateColumn.column : 'không có'}, ${warnings.length} cảnh báo`);
