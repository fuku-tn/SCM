#!/usr/bin/env node
/**
 * Stage 2 · Key Metrics — post.js
 * Chạy SAU lượt trả lời của model.
 *
 *   node post.js <runDir> <stageDir>
 *
 * Đọc  metrics-spec.json  (model viết) → kiểm tra với dữ liệu thật → SINH công thức DAX một cách xác định:
 *   Numerical  : SUM, MAX, MIN, AVG(AVERAGE), MEDIAN, RANGE
 *   Categorical: COUNT, DISTINCTCOUNT
 *   Performance: SUM(...) / COUNT hoặc DISTINCTCOUNT(...)
 *   Thời gian  : LY, LQ, LM, LD  (chỉ theo các kỳ người dùng đã chọn: YoY/QoQ/MoM/DoD)
 *   Delta, Delta %  tương ứng với từng kỳ
 * Ghi: measures.json, measures.dax, và metrics-spec.json (đã chuẩn hóa).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const runDir = process.argv[2], stageDir = process.argv[3];
if (!runDir || !stageDir) { console.error('Usage: node post.js <runDir> <stageDir>'); process.exit(2); }
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const run = readJson(path.join(runDir, 'run.json')) || {};
const profile = readJson(path.join(runDir, '00-input', 'profile.json')) || { sheets: [] };
const warnings = [];
const warn = (m) => { warnings.push(m); console.log('⚠ ' + m); };
const ieq = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const spec = readJson(path.join(stageDir, 'metrics-spec.json'));
if (!spec || !Array.isArray(spec.metrics)) { console.error('Không có metrics-spec.json hợp lệ (cần mảng "metrics"). Model phải xuất file này bằng khối <<<FILE: metrics-spec.json>>>.'); process.exit(1); }

// Ngôn ngữ dashboard = English: nhãn (label) trở thành tên measure/dimension hiển thị → không được còn tiếng Việt
try {
  const rj = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  if (rj.form && rj.form.dashboardLanguage === 'en') {
    const VN = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
    const bad = [];
    for (const k of ['metrics', 'derived', 'performance', 'dimensions']) for (const x of spec[k] || []) if (x && x.label && VN.test(x.label)) bad.push(`${k}:"${x.label}"`);
    if (bad.length) warn('Ngôn ngữ dashboard = English nhưng label còn tiếng Việt (sẽ thành tên measure/nhãn hiển thị): ' + bad.slice(0, 8).join(', '));
  }
} catch { /* không có run.json → bỏ qua */ }

const NUM_AGG = ['SUM', 'MAX', 'MIN', 'AVG', 'MEDIAN', 'RANGE'];
const CAT_AGG = ['COUNT', 'DISTINCTCOUNT'];
const PERIOD_TO_TAG = { YoY: 'LY', QoQ: 'LQ', MoM: 'LM', DoD: 'LD', PY: 'PY', PQ: 'PQ', PM: 'PM' };
const TAG_DAX = { LY: "SAMEPERIODLASTYEAR('Calendar'[Date])", LQ: "DATEADD('Calendar'[Date], -1, QUARTER)", LM: "DATEADD('Calendar'[Date], -1, MONTH)", LD: "DATEADD('Calendar'[Date], -1, DAY)", PY: "PREVIOUSYEAR('Calendar'[Date])", PQ: "PREVIOUSQUARTER('Calendar'[Date])", PM: "PREVIOUSMONTH('Calendar'[Date])" };
const TAG_LABEL = { LY: 'cùng kỳ năm trước', LQ: 'quý trước', LM: 'tháng trước', LD: 'ngày trước', PY: 'năm liền trước', PQ: 'quý liền trước', PM: 'tháng liền trước' };
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const col = (t, c) => `${q(t)}[${String(c).replace(/\]/g, ']]')}]`;
const AGG_DAX = {
  SUM: (t, c) => `SUM(${col(t, c)})`, AVG: (t, c) => `AVERAGE(${col(t, c)})`, MAX: (t, c) => `MAX(${col(t, c)})`, MIN: (t, c) => `MIN(${col(t, c)})`,
  MEDIAN: (t, c) => `MEDIAN(${col(t, c)})`, RANGE: (t, c) => `MAX(${col(t, c)}) - MIN(${col(t, c)})`,
  COUNT: (t, c) => `COUNT(${col(t, c)})`, DISTINCTCOUNT: (t, c) => `DISTINCTCOUNT(${col(t, c)})`,
};

// ---- tra cột trong dữ liệu thật ----
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function lookup(table, column) {
  // Chưa có dữ liệu (người dùng chạy riêng chặng này): không đối chiếu được → tin spec của model
  if (!profile.sheets.length) return { ok: true, sheet: { name: table }, col: { name: column, type: null } };
  const sh = profile.sheets.find((s) => ieq(s.name, table) || norm(s.name) === norm(table)) || (profile.sheets.length === 1 ? profile.sheets[0] : null);
  if (!sh) return { ok: false, why: `không có bảng/sheet "${table}"` };
  const c = sh.columns.find((x) => ieq(x.name, column) || norm(x.name) === norm(column));
  if (!c) return { ok: false, why: `bảng "${sh.name}" không có cột "${column}"`, sheet: sh };
  return { ok: true, sheet: sh, col: c };
}

// ---- chuẩn hóa metrics ----
const metrics = [], byId = new Map();
for (const m of spec.metrics) {
  if (!m || !m.id || !m.label || !m.table || !m.column) { warn('Bỏ qua metric thiếu id/label/table/column: ' + JSON.stringify(m).slice(0, 120)); continue; }
  if (byId.has(m.id)) { warn(`Trùng id metric "${m.id}" → bỏ bản sau`); continue; }
  const lk = lookup(m.table, m.column);
  let kind = m.kind === 'categorical' ? 'categorical' : 'numerical';
  if (lk.ok) {
    const isNum = lk.col.type === 'number';
    if (lk.col.type === null) warn(`Chưa có dữ liệu để đối chiếu cột "${m.table}.${m.column}" — dùng đúng như model khai báo`);
    else if (kind === 'numerical' && !isNum) { warn(`"${m.label}" (${m.table}.${m.column}) được khai báo Numerical nhưng dữ liệu là "${lk.col.type}" → chuyển sang Categorical`); kind = 'categorical'; }
    m.table = lk.sheet.name; m.column = lk.col.name;
  } else { warn(`Metric "${m.label}": ${lk.why} → BỎ metric này (sửa tên bảng/cột trong metrics-spec.json)`); continue; }
  const allowed = kind === 'numerical' ? NUM_AGG : CAT_AGG;
  let aggs = (Array.isArray(m.aggregations) && m.aggregations.length ? m.aggregations : (kind === 'numerical' ? ['SUM'] : ['DISTINCTCOUNT'])).map((a) => String(a).toUpperCase().replace('AVERAGE', 'AVG'));
  const bad = aggs.filter((a) => !allowed.includes(a));
  if (bad.length) warn(`"${m.label}" (${kind}): bỏ phép tính không hợp lệ ${bad.join(', ')} (hợp lệ: ${allowed.join(', ')})`);
  aggs = [...new Set(aggs.filter((a) => allowed.includes(a)))];
  if (!aggs.length) { aggs = [kind === 'numerical' ? 'SUM' : 'DISTINCTCOUNT']; warn(`"${m.label}": không còn phép tính hợp lệ → dùng mặc định ${aggs[0]}`); }
  const fmt = m.format || (kind === 'numerical' ? '#,##0' : '#,##0');
  const nm = { id: m.id, label: String(m.label), kind, table: m.table, column: m.column, aggregations: aggs, format: fmt, unit: m.unit || '' };
  metrics.push(nm); byId.set(nm.id, nm);
}
if (!metrics.length) { console.error('Không có metric hợp lệ nào'); process.exit(1); }

// ---- sinh measure ----
const measures = [], names = new Set(), byRef = new Map();
function addMeasure(x) {
  let name = x.name, i = 2; while (names.has(name.toLowerCase())) name = x.name + ' ' + i++;
  x.name = name; names.add(name.toLowerCase()); measures.push(x); return x;
}
for (const m of metrics) for (const a of m.aggregations) {
  const x = addMeasure({ id: `${m.id}.${a}`, name: `${m.label} (${a})`, table: m.table, expression: AGG_DAX[a](m.table, m.column), column: m.column, format: m.format, folder: 'Base', kind: 'base', unit: m.unit });
  byRef.set(x.id, x);
}
// Performance
for (const p of Array.isArray(spec.performance) ? spec.performance : []) {
  if (!p || !p.id || !p.label || !p.numerator || !p.denominator) { warn('Bỏ qua performance thiếu id/label/numerator/denominator'); continue; }
  const num = byRef.get(p.numerator), den = byRef.get(p.denominator);
  if (!num || !den) { warn(`Performance "${p.label}": tham chiếu ${!num ? p.numerator : p.denominator} không tồn tại (cần dạng "<metricId>.<PHÉP>")`); continue; }
  if (!/^SUM$/.test(num.id.split('.').pop())) warn(`Performance "${p.label}": tử số nên là SUM (đang là ${num.id})`);
  if (!/^(COUNT|DISTINCTCOUNT)$/.test(den.id.split('.').pop())) warn(`Performance "${p.label}": mẫu số nên là COUNT hoặc DISTINCTCOUNT (đang là ${den.id})`);
  const x = addMeasure({ id: p.id, name: String(p.label), table: num.table, expression: `DIVIDE([${num.name}], [${den.name}])`, format: p.format || '#,##0.00', folder: 'Performance', kind: 'performance', unit: p.unit || '' });
  byRef.set(x.id, x);
}
// Phái sinh: biểu thức tự do giữa các measure đã có, ví dụ "{rev.SUM} - {cost.SUM}" (vd Lợi nhuận = Doanh thu - Chi phí)
for (const d of Array.isArray(spec.derived) ? spec.derived : []) {
  if (!d || !d.id || !d.label || !d.expression) { warn('Bỏ qua derived thiếu id/label/expression'); continue; }
  const toks = [...String(d.expression).matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
  const missing = toks.filter((t) => !byRef.has(t));
  if (!toks.length || missing.length) { warn(`Derived "${d.label}": tham chiếu không hợp lệ ${missing.join(', ') || '(không có {id.PHÉP} nào)'} → bỏ`); continue; }
  const home = byRef.get(toks[0]);
  const expr = String(d.expression).replace(/\{([^}]+)\}/g, (_, t) => `[${byRef.get(t).name}]`);
  if (/[;`$]/.test(expr)) { warn(`Derived "${d.label}": biểu thức chứa ký tự không cho phép → bỏ`); continue; }
  const x = addMeasure({ id: d.id, name: String(d.label), table: home.table, expression: expr, format: d.format || home.format, folder: 'Derived', kind: 'performance', unit: d.unit || '' });
  byRef.set(x.id, x);
}
// Thời gian: CHỈ theo kỳ người dùng đã chọn
const chosen = ((run.form && run.form.periods) || []).map((p) => PERIOD_TO_TAG[p]).filter(Boolean);
const fromSpec = (Array.isArray(spec.timeComparisons) ? spec.timeComparisons : []).filter((t) => TAG_DAX[t]);
if (fromSpec.length && chosen.length && fromSpec.slice().sort().join() !== chosen.slice().sort().join()) warn(`Model đề xuất kỳ ${fromSpec.join(',')} nhưng người dùng chọn ${chosen.join(',')} → dùng theo người dùng`);
const tags = chosen.length ? chosen : (run.form && run.form.periods ? [] : fromSpec);
let applyTo = Array.isArray(spec.timeApplyTo) && spec.timeApplyTo.length ? spec.timeApplyTo : measures.filter((x) => x.kind === 'performance' || /\.SUM$/.test(x.id)).map((x) => x.id);
applyTo = applyTo.filter((id) => { if (byRef.has(id)) return true; warn(`timeApplyTo: "${id}" không tồn tại → bỏ`); return false; });
const calendar = tags.length ? { table: 'Calendar', column: 'Date' } : null;
for (const id of applyTo) for (const tag of tags) {
  const base = byRef.get(id); if (base.kind !== 'base' && base.kind !== 'performance') continue;
  const ly = addMeasure({ id: `${id}@${tag}`, name: `${base.name} ${tag}`, table: base.table, expression: `CALCULATE([${base.name}], ${TAG_DAX[tag]})`, format: base.format, folder: 'Time intelligence', kind: 'time', baseId: id, comparison: tag });
  addMeasure({ id: `${id}@${tag}.delta`, name: `${base.name} Delta ${tag}`, table: base.table, expression: `[${base.name}] - [${ly.name}]`, format: base.format, folder: 'Time intelligence', kind: 'delta', baseId: id, comparison: tag });
  addMeasure({ id: `${id}@${tag}.deltaPct`, name: `${base.name} Delta % ${tag}`, table: base.table, expression: `DIVIDE([${base.name}] - [${ly.name}], [${ly.name}])`, format: '0.0%;-0.0%;0.0%', folder: 'Time intelligence', kind: 'deltaPct', baseId: id, comparison: tag });
}
if (!tags.length && (run.form && run.form.periods && run.form.periods.length === 0)) console.log('Người dùng không chọn kỳ so sánh → không tạo measure thời gian.');

// ---- dimension + quan hệ measure–dimension ----
const dims = [];
for (const d of Array.isArray(spec.dimensions) ? spec.dimensions : []) {
  if (!d || !d.id || !d.label || !d.table || !d.column) { warn('Bỏ qua dimension thiếu id/label/table/column'); continue; }
  const lk = lookup(d.table, d.column);
  if (lk.ok) { d.table = lk.sheet.name; d.column = lk.col.name; } else { warn(`Dimension "${d.label}": ${lk.why} → BỎ dimension này`); continue; }
  dims.push({ id: d.id, label: d.label, table: d.table, column: d.column, isDate: !!d.isDate || (lk.ok && lk.col.type === 'date') });
}
const dimById = new Map(dims.map((d) => [d.id, d]));
const patternOf = (nd, nm) => (nd === 1 && nm === 1 ? '1-1' : nd > 1 && nm === 1 ? 'N-1' : nd === 1 && nm > 1 ? '1-N' : 'N-N');
const combos = [];
for (const c of Array.isArray(spec.combos) ? spec.combos : []) {
  if (!c) continue;
  const dd = (c.dimensions || []).filter((id) => { if (dimById.has(id)) return true; warn(`combo: dimension "${id}" không tồn tại → bỏ`); return false; });
  const mm = (c.measures || []).map((id) => byRef.get(id)).filter((x, i) => { if (x) return true; warn(`combo: measure "${(c.measures || [])[i]}" không tồn tại → bỏ`); return false; });
  if (!dd.length || !mm.length) continue;
  const pat = patternOf(dd.length, mm.length);
  if (c.pattern && c.pattern !== pat) warn(`combo "${c.purpose || ''}": pattern ${c.pattern} sai → sửa thành ${pat} (${dd.length} dim, ${mm.length} measure)`);
  combos.push({ pattern: pat, dimensions: dd, measures: mm.map((x) => x.id), measureNames: mm.map((x) => x.name), purpose: c.purpose || '', section: c.section || '', chart: c.chart || '' });
}

// ---- ghi kết quả ----
const out = { version: 1, calendar, comparisons: tags, measures, dimensions: dims, combos, warnings };
fs.writeFileSync(path.join(stageDir, 'measures.json'), JSON.stringify(out, null, 2), 'utf8');
const dax = [];
dax.push('// Key Metrics — công thức DAX do script sinh từ metrics-spec.json (không sửa tay; sửa spec rồi chạy lại)');
if (calendar) dax.push("// Cần bảng ngày 'Calendar'[Date] (chặng Dashboard tự tạo và nối với cột ngày của bảng fact)");
let folder = '';
for (const x of measures) {
  if (x.folder !== folder) { folder = x.folder; dax.push(`\n// ===== ${folder} =====`); }
  dax.push(`${x.name} = ${x.expression}`);
}
fs.writeFileSync(path.join(stageDir, 'measures.dax'), dax.join('\n') + '\n', 'utf8');
spec.metrics = metrics; spec.dimensions = dims; spec.combos = combos.map((c) => ({ pattern: c.pattern, dimensions: c.dimensions, measures: c.measures, purpose: c.purpose, section: c.section, chart: c.chart }));
spec.timeComparisons = tags; spec.warnings = warnings;
fs.writeFileSync(path.join(stageDir, 'metrics-spec.json'), JSON.stringify(spec, null, 2), 'utf8');
// nối phần tự sinh vào result.md (xóa bản cũ nếu chạy lại) để tài liệu luôn khớp với file thật
{
  const rp = path.join(stageDir, 'result.md'); const MARK = '<!-- AUTO-GENERATED:BEGIN -->';
  if (fs.existsSync(rp)) {
    let md = fs.readFileSync(rp, 'utf8'); const i = md.indexOf(MARK); if (i >= 0) md = md.slice(0, i).trimEnd() + '\n';
    const T = ['', MARK, '## Công thức DAX (tự sinh bởi scripts/post.js)', '', `Tổng ${measures.length} measure · kỳ so sánh: ${tags.join(', ') || 'không'} · file đầy đủ: \`measures.dax\`, \`measures.json\``, '', '| Measure | Nhóm | DAX | Format |', '|---|---|---|---|'];
    for (const x of measures) T.push(`| ${x.name} | ${x.folder} | \`${x.expression.replace(/\|/g, '\\|')}\` | \`${x.format || ''}\` |`);
    if (warnings.length) T.push('', '### Cảnh báo khi kiểm tra metrics-spec.json', ...warnings.map((w) => '- ' + w));
    if (combos.length) { T.push('', '### Ghép Measure–Dimension đã kiểm tra', '| Pattern | Dimension | Measure | Mục đích | Biểu đồ gợi ý |', '|---|---|---|---|---|'); for (const c of combos) T.push(`| ${c.pattern} | ${c.dimensions.map((d) => (dimById.get(d) || {}).label || d).join(', ')} | ${c.measureNames.join(', ')} | ${c.purpose} | ${c.chart || ''} |`); }
    T.push('<!-- AUTO-GENERATED:END -->', '');
    fs.writeFileSync(rp, md + T.join('\n'), 'utf8');
  }
}
const k = (n) => measures.filter((x) => x.kind === n).length;
console.log(`measures.json: ${measures.length} measure (base ${k('base')}, performance ${k('performance')}, time ${k('time')}, delta ${k('delta')}, delta% ${k('deltaPct')}); ${dims.length} dimension; ${combos.length} combo; kỳ so sánh: ${tags.join(', ') || 'không'}; ${warnings.length} cảnh báo`);
