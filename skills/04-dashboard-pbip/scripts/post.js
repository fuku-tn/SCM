#!/usr/bin/env node
/**
 * Stage 4 · Dashboard (PBIP) — post.js
 * Chạy SAU lượt trả lời của model. Dựng project Power BI (PBIP) hoàn chỉnh một cách XÁC ĐỊNH.
 *
 *   node post.js <runDir> <stageDir>
 *
 * Đầu vào
 *   <stageDir>/dashboard-spec.json            (model viết — bố cục trang / biểu đồ)
 *   <runDir>/03-data-etl/model-spec.json      (bảng, cột, quan hệ, cột ngày)
 *   <runDir>/03-data-etl/clean/*.csv          (dữ liệu đã làm sạch)
 *   <runDir>/02-key-metrics/measures.json     (measure DAX đã sinh)
 *   <runDir>/run.json                         (theme 5 màu người dùng chọn)
 * Đầu ra
 *   <stageDir>/pbip/<Tên>/ ... (.pbip, .Report/, .SemanticModel/, data/, README.md)
 *   <stageDir>/pbip-validation.md
 * Nếu thiếu / hỏng dashboard-spec.json → tự sinh dashboard mặc định từ measures.json (vẫn ra PBIP dùng được).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const runDir = process.argv[2], stageDir = process.argv[3];
if (!runDir || !stageDir) { console.error('Usage: node post.js <runDir> <stageDir>'); process.exit(2); }
const SKILL_DIR = path.resolve(__dirname, '..');
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const CFG = readJson(path.join(SKILL_DIR, 'references', 'pbir-config.json')) || {};
const SCHEMA = Object.assign({
  report: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.0.0/schema.json',
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  version: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
  pbir: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
  pbism: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
  pbip: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
}, CFG.schemas || {});
const THEME_VERSION = Object.assign({ visual: '2.0.0', page: '2.0.0', report: '3.0.0' }, CFG.themeVersionAtImport || {});
const VERSION_JSON = CFG.versionJson || '2.0.0';
const COMPAT = CFG.compatibilityLevel || 1600;

const run = readJson(path.join(runDir, 'run.json')) || {};
const EN = !!(run.form && run.form.dashboardLanguage === 'en'); // chữ hiển thị trên dashboard bằng tiếng Anh
const modelSpec = readJson(path.join(runDir, '03-data-etl', 'model-spec.json'));
const mjson = readJson(path.join(runDir, '02-key-metrics', 'measures.json'));
const warnings = [], fatals = [];
const warn = (m) => { warnings.push(m); console.log('⚠ ' + m); };
if (!modelSpec || !modelSpec.tables || !modelSpec.tables.length) { console.error('Thiếu 03-data-etl/model-spec.json — chạy lại chặng Data (ETL) trước.'); process.exit(1); }
const cleanDir = path.join(runDir, '03-data-etl', 'clean');
const ieq = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// ============ tiện ích ============
const guid = (seed) => { const h = crypto.createHash('md5').update(String(seed)).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const id20 = (seed) => crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 20);
const wjson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8'); };
const wtext = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };
const wtmdl = (p, s) => wtext(p, s.replace(/\r?\n/g, '\r\n')); // Power BI Desktop ghi TMDL với CRLF
const tq = (n) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : "'" + String(n).replace(/'/g, "''") + "'"); // tên trong TMDL
const dq = (n) => "'" + String(n).replace(/'/g, "''") + "'";                                              // tên bảng trong DAX
const ml = (s) => String(s).replace(/"/g, '""');                                                           // chuỗi trong M
const safeName = (s) => String(s || 'BIE_Dashboard').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'BIE_Dashboard';
const lit = (v) => ({ expr: { Literal: { Value: String(v) } } });
const litS = (s) => lit("'" + String(s).replace(/'/g, "''") + "'");
const litB = (b) => lit(b ? 'true' : 'false');
const litN = (n) => lit(String(n) + 'D');
const solid = (hex) => ({ solid: { color: litS(hex) } });

// ============ mô hình ============
const tables = modelSpec.tables.filter((t) => fs.existsSync(path.join(cleanDir, t.file)));
if (tables.length !== modelSpec.tables.length) warn('Một số bảng thiếu file CSV trong clean/ → bỏ: ' + modelSpec.tables.filter((t) => !tables.includes(t)).map((t) => t.name).join(', '));
if (!tables.length) { console.error('Không có file CSV đã làm sạch'); process.exit(1); }
const tableByName = (n) => tables.find((t) => ieq(t.name, n));
const hasCalendar = !!(modelSpec.dateColumn && tableByName(modelSpec.dateColumn.table));
const dateTbl = hasCalendar ? tableByName(modelSpec.dateColumn.table) : null;
const CALENDAR_COLS = [
  { name: 'Date', type: 'date' }, { name: 'Year', type: 'int' }, { name: 'Quarter', type: 'text' }, { name: 'Month', type: 'text' },
  { name: 'MonthNo', type: 'int' }, { name: 'YearQuarter', type: 'text' }, { name: 'YearMonth', type: 'text' }, { name: 'Day', type: 'int' },
];
const colExists = (tn, cn) => {
  if (hasCalendar && ieq(tn, 'Calendar')) return CALENDAR_COLS.find((c) => ieq(c.name, cn)) || null;
  const t = tableByName(tn); return t ? (t.columns.find((c) => ieq(c.name, cn)) || null) : null;
};
const canon = (tn, cn) => { // tên chuẩn (đúng hoa/thường) của bảng/cột
  if (hasCalendar && ieq(tn, 'Calendar')) { const c = CALENDAR_COLS.find((x) => ieq(x.name, cn)); return c ? { table: 'Calendar', column: c.name } : null; }
  const t = tableByName(tn); if (!t) return null; const c = t.columns.find((x) => ieq(x.name, cn)); return c ? { table: t.name, column: c.name } : null;
};

// ============ measures (kiểm tra chéo + loại measure phụ thuộc bị hỏng) ============
let measures = [];
if (mjson && Array.isArray(mjson.measures)) measures = mjson.measures.map((m) => ({ ...m }));
else warn('Không có 02-key-metrics/measures.json → dashboard sẽ không có measure');
{
  const needCal = (m) => /'Calendar'\[Date\]/.test(m.expression);
  let changed = true; const drop = new Set();
  const nameSet = () => new Set(measures.filter((m) => !drop.has(m.id)).map((m) => m.name));
  for (const m of measures) {
    if (!tableByName(m.table)) { drop.add(m.id); warn(`Measure "${m.name}": bảng "${m.table}" không có trong mô hình → bỏ`); continue; }
    if (m.kind === 'base' && m.column && !colExists(m.table, m.column)) { drop.add(m.id); warn(`Measure "${m.name}": cột ${m.table}.${m.column} không có trong mô hình → bỏ`); continue; }
    if (needCal(m) && !hasCalendar) { drop.add(m.id); warn(`Measure "${m.name}": cần bảng Calendar nhưng mô hình không có cột ngày → bỏ`); }
  }
  while (changed) {
    changed = false; const names = nameSet();
    for (const m of measures) {
      if (drop.has(m.id)) continue;
      // tham chiếu dạng 'Bảng'[Cột] bị loại ra khỏi phép kiểm tra measure
      const exprNoCols = m.expression.replace(/'(?:[^']|'')+'\[[^\]]+\]/g, '');
      const refs2 = [...exprNoCols.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]);
      const miss = refs2.filter((r) => !names.has(r));
      if (miss.length) { drop.add(m.id); changed = true; warn(`Measure "${m.name}": phụ thuộc measure đã bị bỏ (${miss.join(', ')}) → bỏ`); }
    }
  }
  measures = measures.filter((m) => !drop.has(m.id));
}
const measureByName = (n) => measures.find((m) => ieq(m.name, n));

// ============ dashboard spec ============
const COLORS = ((run.form && run.form.colors) || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
let spec = readJson(path.join(stageDir, 'dashboard-spec.json'));
const PAGE_W = 1280, PAGE_H = 720, MARGIN = 16, GAP = 8, COLS = 12, ROWS = 12;
const CELL_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS, CELL_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;

function defaultSpec() {
  const base = measures.filter((m) => m.kind === 'base' || m.kind === 'performance');
  const kpis = base.filter((m) => /\((SUM|DISTINCTCOUNT|COUNT)\)$/.test(m.name) || m.kind === 'performance').slice(0, 4);
  const visuals = kpis.map((m, i) => ({ id: 'kpi' + i, type: 'card', title: m.name, measures: [m.name], grid: { col: i * 3, row: 0, w: 3, h: 2 } }));
  const first = kpis[0] || base[0];
  const dimsList = (mjson && mjson.dimensions) || [];
  const catDim = dimsList.find((d) => !d.isDate && canon(d.table, d.column));
  if (first && hasCalendar) visuals.push({ id: 'trend', type: 'lineChart', title: EN ? `${first.name} by month` : `${first.name} theo tháng`, category: { table: 'Calendar', column: 'YearMonth' }, measures: [first.name], grid: { col: 0, row: 2, w: 7, h: 5 } });
  if (first && catDim) visuals.push({ id: 'cmp', type: 'clusteredBarChart', title: EN ? `${first.name} by ${catDim.label}` : `${first.name} theo ${catDim.label}`, category: { table: catDim.table, column: catDim.column }, measures: [first.name], grid: { col: 7, row: 2, w: 5, h: 5 } });
  if (first && catDim) visuals.push({ id: 'tbl', type: 'tableEx', title: EN ? 'Details' : 'Chi tiết', columns: [{ table: catDim.table, column: catDim.column }], measures: base.slice(0, 4).map((m) => m.name), grid: { col: 0, row: 7, w: 12, h: 5 } });
  return { projectName: 'BIE_Dashboard', title: 'Dashboard', pages: [{ id: 'overview', name: EN ? 'Overview' : 'Tổng quan', visuals }] };
}
// Template Power BI người dùng đã chọn (lib/pbix-template.js) — nếu có thì dựng báo cáo theo template
const TPL = (() => { try { return require(path.join(process.env.BIE_ROOT || path.resolve(__dirname, '..', '..', '..'), 'lib', 'pbix-template.js')); } catch (e) { console.log('Không nạp được lib/pbix-template.js: ' + e.message); return null; } })();
const tplId = run.form && (run.form.templateSource === 'upload' ? 'upload' : run.form.template);
let tpl = null;
try { tpl = TPL && tplId ? TPL.resolveForRun(runDir, run.form) : null; } catch (e) { warn('Không đọc được template: ' + e.message); }
if (tplId && !tpl) warn(`Template "${tplId}" không tồn tại → dựng dashboard theo bố cục mặc định`);
const approvedPlan = readJson(path.join(runDir, '00-input', 'dashboard-plan.json')); // bố cục người dùng đã duyệt (nếu có)
const templateMode = !!tpl;
if (templateMode) { if (!spec || typeof spec !== 'object') spec = {}; }
else if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) { console.log('Model không cung cấp dashboard-spec.json hợp lệ → tự sinh dashboard mặc định từ measures.json'); spec = defaultSpec(); spec.autoGenerated = true; }

// ============ Top N: giới hạn số giá trị hiển thị của chiều có quá nhiều giá trị ============
// Không dùng bộ lọc TopN (dễ sai cấu trúc); dùng measure xếp hạng RANKX → nhóm ngoài Top N có giá trị trống nên biểu đồ tự bỏ. DAX do script sinh.
const topNMeasures = new Map(); const topNNotes = [];
function topNMeasure(targetName, rankName, ref, n) {
  const tgt = measureByName(targetName), rk = measureByName(rankName), c = ref && canon(ref.table, ref.column);
  if (!tgt || !rk || !c || ieq(c.table, 'Calendar') || !(n >= 1)) return null;
  const key = [tgt.name, rk.name, c.table, c.column, n].join('|');
  if (topNMeasures.has(key)) return topNMeasures.get(key);
  let name = `${tgt.name} (Top ${n})`;
  if (measureByName(name)) name = `${tgt.name} (Top ${n} ${c.column})`;
  for (let i = 2; measureByName(name); i++) name = `${tgt.name} (Top ${n} ${c.column} ${i})`;
  const col = `${dq(c.table)}[${String(c.column).replace(/\]/g, ']]')}]`;
  measures.push({ id: 'topn_' + topNMeasures.size, name, table: tgt.table, kind: 'topn', folder: 'Top N', format: tgt.format, expression: `IF(RANKX(ALL(${col}), [${rk.name}], , DESC, Dense) <= ${n}, [${tgt.name}])` });
  topNMeasures.set(key, name); topNNotes.push(`${tgt.name}: chỉ hiện Top ${n} theo ${c.table}[${c.column}] (xếp hạng theo ${rk.name})`);
  return name;
}
{
  const asArr = (x) => (Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]);
  if (templateMode && spec.bind) {
    for (const b of Object.values(spec.bind)) {
      const n = Math.floor(+(b && b.topN)); if (!(n >= 1) || !b.roles) continue;
      const catRole = ['Category', 'Group', 'Rows', 'Axis'].find((r) => asArr(b.roles[r]).some((f) => f && f.column));
      if (!catRole) continue;
      const ref = asArr(b.roles[catRole]).find((f) => f && f.column);
      const rank = Object.entries(b.roles).filter(([r]) => r !== catRole).flatMap(([, fs]) => asArr(fs)).find((f) => typeof f === 'string');
      if (!rank) continue;
      for (const r of Object.keys(b.roles)) if (r !== catRole) b.roles[r] = asArr(b.roles[r]).map((f) => (typeof f === 'string' ? topNMeasure(f, rank, ref, n) || f : f));
    }
  } else if (!templateMode && Array.isArray(spec.pages)) {
    for (const pg of spec.pages) for (const v of pg.visuals || []) {
      const n = Math.floor(+v.topN); if (!(n >= 1) || !v.category || !asArr(v.measures).length) continue;
      const rank = v.measures[0]; v.measures = v.measures.map((m) => topNMeasure(m, rank, v.category, n) || m);
    }
  }
}

// ============ định nghĩa loại biểu đồ ============
const ROLES = {
  card: { values: 'Values' },
  clusteredBarChart: { category: 'Category', values: 'Y', series: 'Series' }, clusteredColumnChart: { category: 'Category', values: 'Y', series: 'Series' },
  stackedBarChart: { category: 'Category', values: 'Y', series: 'Series' }, stackedColumnChart: { category: 'Category', values: 'Y', series: 'Series' },
  hundredPercentStackedBarChart: { category: 'Category', values: 'Y', series: 'Series' }, hundredPercentStackedColumnChart: { category: 'Category', values: 'Y', series: 'Series' },
  lineChart: { category: 'Category', values: 'Y', series: 'Series' }, areaChart: { category: 'Category', values: 'Y', series: 'Series' },
  lineClusteredColumnComboChart: { category: 'Category', values: 'Y', lineValues: 'Y2', series: 'Series' },
  donutChart: { category: 'Category', values: 'Y' }, pieChart: { category: 'Category', values: 'Y' },
  treemap: { category: 'Group', values: 'Values' },
  scatterChart: { category: 'Category', x: 'X', y: 'Y', size: 'Size' },
  waterfallChart: { category: 'Category', values: 'Y', breakdown: 'Breakdown' },
  funnel: { category: 'Category', values: 'Y' },
  tableEx: { columns: 'Values', values: 'Values' },
  slicer: { field: 'Values' },
};
const HORIZ = new Set(['clusteredBarChart', 'stackedBarChart', 'hundredPercentStackedBarChart']);
const AXIS_CHARTS = new Set(['clusteredBarChart', 'clusteredColumnChart', 'stackedBarChart', 'stackedColumnChart', 'hundredPercentStackedBarChart', 'hundredPercentStackedColumnChart', 'lineChart', 'areaChart', 'lineClusteredColumnComboChart', 'waterfallChart']);
const PIE = new Set(['donutChart', 'pieChart']);

const colField = (tn, cn, extra) => ({ field: { Column: { Expression: { SourceRef: { Entity: tn } }, Property: cn } }, queryRef: `${tn}.${cn}`, nativeQueryRef: cn, ...(extra || {}) });
const msrField = (m) => ({ field: { Measure: { Expression: { SourceRef: { Entity: m.table } }, Property: m.name } }, queryRef: `${m.table}.${m.name}`, nativeQueryRef: m.name });
const sortExpr = (f) => f.field;

function buildVisual(v, pageId, z) {
  const type = ROLES[v.type] ? v.type : null;
  if (!type) { warn(`Visual "${v.id || v.title}": loại "${v.type}" chưa hỗ trợ → bỏ (hỗ trợ: ${Object.keys(ROLES).join(', ')})`); return null; }
  const R = ROLES[type]; const q = {}; const used = [];
  const addProj = (role, p) => { (q[role] = q[role] || { projections: [] }).projections.push(p); };
  const getM = (names, label) => {
    const out = [];
    for (const n of names || []) { const m = measureByName(n); if (!m) warn(`Visual "${v.id || v.title}": measure "${n}" không tồn tại → bỏ khỏi ${label}`); else out.push(m); }
    return out;
  };
  const getC = (ref, label) => {
    if (!ref) return null; const c = canon(ref.table, ref.column);
    if (!c) { warn(`Visual "${v.id || v.title}": cột ${ref.table}.${ref.column} (${label}) không có trong mô hình → bỏ`); return null; } return c;
  };
  let sortField = null, sortDir = 'Descending';
  if (type === 'slicer') {
    const c = getC(v.field || v.category, 'slicer'); if (!c) return null; addProj(R.field, colField(c.table, c.column, { active: true }));
  } else if (type === 'tableEx') {
    for (const ref of v.columns || []) { const c = getC(ref, 'cột bảng'); if (c) addProj(R.columns, colField(c.table, c.column)); }
    for (const m of getM(v.measures, 'bảng')) addProj(R.values, msrField(m));
    if (!q.Values) return null;
  } else if (type === 'scatterChart') {
    const mx = getM(v.x ? [v.x] : [], 'trục X')[0], my = getM(v.y ? [v.y] : [], 'trục Y')[0], ms = getM(v.size ? [v.size] : [], 'kích thước')[0];
    if (!mx || !my) { warn(`Visual "${v.id || v.title}": scatter cần x và y là measure hợp lệ → bỏ`); return null; }
    const c = getC(v.category, 'chi tiết'); if (c) addProj(R.category, colField(c.table, c.column, { active: true }));
    addProj(R.x, msrField(mx)); addProj(R.y, msrField(my)); if (ms) addProj(R.size, msrField(ms));
  } else {
    const ms = getM(v.measures, 'giá trị');
    if (!ms.length) { warn(`Visual "${v.id || v.title}": không có measure hợp lệ → bỏ`); return null; }
    if (type !== 'card') {
      const c = getC(v.category, 'trục/nhóm'); if (!c) { warn(`Visual "${v.id || v.title}" (${type}) cần category → bỏ`); return null; }
      addProj(R.category, colField(c.table, c.column, { active: true })); sortField = colField(c.table, c.column);
      if (ieq(c.table, 'Calendar')) sortDir = 'Ascending';
      const s = getC(v.series, 'legend'); if (s && R.series) addProj(R.series, colField(s.table, s.column, { active: true }));
    }
    if (PIE.has(type) || type === 'treemap') ms.splice(1);
    if (type === 'lineClusteredColumnComboChart') {
      const lines = getM(v.lineMeasures, 'đường'); ms.forEach((m) => addProj(R.values, msrField(m))); lines.forEach((m) => addProj(R.lineValues, msrField(m)));
      if (!lines.length) warn(`Visual "${v.id || v.title}": combo không có lineMeasures → chỉ vẽ cột`);
    } else ms.forEach((m) => addProj(R.values, msrField(m)));
    if (sortField && sortDir === 'Descending') sortField = msrField(ms[0]); // IBCS: sắp giảm dần theo giá trị cho danh mục phi thời gian
  }
  // ---- định dạng theo IBCS (tối giản, chỉ dùng thuộc tính phổ biến) ----
  const objects = {};
  const hasSeries = !!q.Series;
  if (AXIS_CHARTS.has(type)) {
    objects.valueAxis = [{ properties: { show: litB(false), gridlineShow: litB(false) } }];
    objects.categoryAxis = [{ properties: { gridlineShow: litB(false) } }];
    objects.labels = [{ properties: { show: litB(true) } }];
    if (type === 'lineChart' || type === 'lineClusteredColumnComboChart') objects.lineStyles = [{ properties: { showMarker: litB(false) } }];
  }
  if (PIE.has(type)) objects.labels = [{ properties: { show: litB(true), labelStyle: litS('Category, percent of total') } }];
  if (type === 'treemap') objects.labels = [{ properties: { show: litB(true) } }];
  if (type === 'card') objects.categoryLabels = [{ properties: { show: litB(true) } }];
  if (type === 'tableEx') objects.grid = [{ properties: { gridHorizontal: litB(false), gridVertical: litB(false) } }];
  if (type !== 'card' && type !== 'tableEx' && type !== 'slicer') objects.legend = [{ properties: { show: litB(hasSeries && !PIE.has(type) ? true : false) } }];
  const vco = {
    title: [{ properties: { show: litB(!!v.title), ...(v.title ? { text: litS(v.title) } : {}) } }],
    background: [{ properties: { show: litB(false) } }],
    border: [{ properties: { show: litB(false) } }],
  };
  if (v.subtitle) vco.subTitle = [{ properties: { show: litB(true), text: litS(v.subtitle) } }];
  // ---- vị trí ----
  const g = v.grid || {};
  const col = Math.max(0, Math.min(COLS - 1, Math.round(+g.col || 0))), row = Math.max(0, Math.min(ROWS - 1, Math.round(+g.row || 0)));
  const w = Math.max(1, Math.min(COLS - col, Math.round(+g.w || 4))), h = Math.max(1, Math.min(ROWS - row, Math.round(+g.h || 3)));
  const position = { x: Math.round(MARGIN + col * (CELL_W + GAP)), y: Math.round(MARGIN + row * (CELL_H + GAP)), z: z * 1000, height: Math.round(h * CELL_H + (h - 1) * GAP), width: Math.round(w * CELL_W + (w - 1) * GAP), tabOrder: z * 1000 };
  const name = id20(`${pageId}:${v.id || v.title}:${z}`);
  const visual = { visualType: type, query: { queryState: q }, objects, visualContainerObjects: vco, drillFilterOtherVisuals: true };
  if (sortField && type !== 'card') visual.query.sortDefinition = { sort: [{ field: sortExpr(sortField), direction: sortDir }], isDefaultSort: true };
  return { name, json: { $schema: SCHEMA.visual, name, position, visual } };
}

// ============ dựng thư mục project ============
const projectName = safeName(spec.projectName || modelSpec.modelName);
const root = path.join(stageDir, 'pbip', projectName);
fs.rmSync(path.join(stageDir, 'pbip'), { recursive: true, force: true });
const repDir = path.join(root, projectName + '.Report'), smDir = path.join(root, projectName + '.SemanticModel'), dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
for (const t of tables) fs.copyFileSync(path.join(cleanDir, t.file), path.join(dataDir, t.file));

// ---- .pbip ----
wjson(path.join(root, projectName + '.pbip'), { $schema: SCHEMA.pbip, version: '1.0', artifacts: [{ report: { path: projectName + '.Report' } }], settings: { enableAutoRecovery: true } });
wtext(path.join(root, '.gitignore'), '**/.pbi/localSettings.json\n**/.pbi/cache.abf\n');

// ---- semantic model ----
wjson(path.join(smDir, 'definition.pbism'), { $schema: SCHEMA.pbism, version: '4.0' });
wtmdl(path.join(smDir, 'definition', 'database.tmdl'), `database ${tq(projectName)}\n\tcompatibilityLevel: ${COMPAT}\n`);
const DT = { int: 'int64', decimal: 'double', text: 'string', date: 'dateTime', datetime: 'dateTime', bool: 'boolean' };
const MT = { int: 'Int64.Type', decimal: 'type number', text: 'type text', date: 'type date', datetime: 'type datetime', bool: 'type logical' };
const FMT = { int: '#,##0', decimal: '#,##0.00', date: 'yyyy-mm-dd', datetime: 'yyyy-mm-dd hh:nn:ss' };
const dataFolder = dataDir.replace(/\//g, '\\');
wtmdl(path.join(smDir, 'definition', 'expressions.tmdl'), `expression DataFolder = "${ml(dataFolder)}" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]\n\tlineageTag: ${guid('param:DataFolder')}\n\n\tannotation PBI_ResultType = Text\n`);

const tableTmdl = (t) => {
  const L = [];
  L.push(`table ${tq(t.name)}`, `\tlineageTag: ${guid('table:' + t.name)}`, '');
  const myMeasures = measures.filter((m) => ieq(m.table, t.name));
  for (const m of myMeasures) {
    L.push(`\tmeasure ${tq(m.name)} = ${m.expression}`);
    if (m.format) L.push(`\t\tformatString: ${m.format}`);
    if (m.folder) L.push(`\t\tdisplayFolder: ${m.folder}`);
    L.push(`\t\tlineageTag: ${guid('measure:' + t.name + ':' + m.name)}`, '');
  }
  for (const c of t.columns) {
    L.push(`\tcolumn ${tq(c.name)}`, `\t\tdataType: ${DT[c.type] || 'string'}`);
    const f = c.format || FMT[c.type]; if (f) L.push(`\t\tformatString: ${f}`);
    if (c.hidden) L.push('\t\tisHidden');
    L.push(`\t\tlineageTag: ${guid('col:' + t.name + ':' + c.name)}`, `\t\tsummarizeBy: ${c.summarizeBy || 'none'}`, `\t\tsourceColumn: ${c.name}`, '', '\t\tannotation SummarizationSetBy = Automatic', '');
  }
  // Cột ngày làm khóa nối Calendar phải là kiểu date. Nếu dữ liệu có cả giờ thì ép thẳng sang `type date` sẽ lỗi hàng loạt
  // → đọc là datetime rồi mới cắt về date (Date.From) ở bước riêng.
  let dateOnlyCol = null;
  const typed = t.columns.map((c) => {
    let mt = MT[c.type] || 'type text';
    if (hasCalendar && ieq(t.name, modelSpec.dateColumn.table) && ieq(c.name, modelSpec.dateColumn.column)) {
      if (c.type === 'datetime') { mt = 'type datetime'; dateOnlyCol = c.name; } else mt = 'type date';
    }
    return `{"${ml(c.name)}", ${mt}}`;
  }).join(', ');
  const lastStep = dateOnlyCol ? 'DateOnly' : 'Typed';
  L.push(`\tpartition ${tq(t.name)} = m`, '\t\tmode: import', '\t\tsource =', '\t\t\t\tlet',
    `\t\t\t\t\tSource = Csv.Document(File.Contents(DataFolder & "\\${ml(t.file)}"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),`,
    '\t\t\t\t\tPromoted = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),',
    `\t\t\t\t\tTyped = Table.TransformColumnTypes(Promoted, {${typed}}, "en-US")${dateOnlyCol ? ',' : ''}`,
    ...(dateOnlyCol ? [`\t\t\t\t\tDateOnly = Table.TransformColumns(Typed, {{"${ml(dateOnlyCol)}", each Date.From(_), type date}})`] : []),
    '\t\t\t\tin', `\t\t\t\t\t${lastStep}`, '', '\tannotation PBI_ResultType = Table', '');
  return L.join('\n');
};
for (const t of tables) wtmdl(path.join(smDir, 'definition', 'tables', t.name.replace(/[\\/:*?"<>|]/g, '_') + '.tmdl'), tableTmdl(t));

let calendarName = null;
if (hasCalendar) {
  const fact = dateTbl.name, fc = modelSpec.dateColumn.column;
  const L = [`table Calendar`, '\tdataCategory: Time', `\tlineageTag: ${guid('table:Calendar')}`, ''];
  const cc = (name, type, expr, extra) => {
    L.push(expr ? `\tcolumn ${tq(name)} = ${expr}` : `\tcolumn ${tq(name)}`, `\t\tdataType: ${DT[type]}`);
    if (type === 'date') L.push('\t\tformatString: yyyy-mm-dd');
    if (extra && extra.key) L.push('\t\tisKey');
    if (expr) L.push('\t\tisDataTypeInferred');
    L.push(`\t\tlineageTag: ${guid('col:Calendar:' + name)}`, '\t\tsummarizeBy: none');
    if (!expr) L.push(`\t\tsourceColumn: [${name}]`);
    if (extra && extra.sortBy) L.push(`\t\tsortByColumn: ${extra.sortBy}`);
    L.push('');
  };
  cc('Date', 'date', null, { key: true });
  cc('Year', 'int', 'YEAR([Date])'); cc('Quarter', 'text', '"Q" & QUARTER([Date])');
  cc('Month', 'text', 'FORMAT([Date], "MMM")', { sortBy: 'MonthNo' }); cc('MonthNo', 'int', 'MONTH([Date])');
  cc('YearQuarter', 'text', 'YEAR([Date]) & "-Q" & QUARTER([Date])'); cc('YearMonth', 'text', 'FORMAT([Date], "yyyy-MM")'); cc('Day', 'int', 'DAY([Date])');
  L.push('\tpartition Calendar = calculated', '\t\tmode: import', `\t\tsource = CALENDAR(DATE(YEAR(MIN(${dq(fact)}[${fc}])), 1, 1), DATE(YEAR(MAX(${dq(fact)}[${fc}])), 12, 31))`, '', '\tannotation PBI_Id = Calendar', '');
  wtmdl(path.join(smDir, 'definition', 'tables', 'Calendar.tmdl'), L.join('\n'));
  calendarName = 'Calendar';
}

// ---- quan hệ ----
const relLines = [];
const refCol = (t, c) => `${tq(t)}.${tq(c)}`;
for (const r of modelSpec.relationships || []) {
  if (!tableByName(r.fromTable) || !tableByName(r.toTable)) continue;
  const L = [`relationship ${guid('rel:' + r.fromTable + r.fromColumn + r.toTable + r.toColumn)}`];
  if (r.cardinality === 'oneToOne') L.push('\tfromCardinality: one', '\ttoCardinality: one');
  else if (r.cardinality === 'manyToMany') L.push('\tfromCardinality: many', '\ttoCardinality: many');
  if (r.crossFilter === 'both' || r.cardinality === 'oneToOne') L.push('\tcrossFilteringBehavior: bothDirections');
  L.push(`\tfromColumn: ${refCol(r.fromTable, r.fromColumn)}`, `\ttoColumn: ${refCol(r.toTable, r.toColumn)}`, '');
  relLines.push(L.join('\n'));
}
if (hasCalendar) relLines.push([`relationship ${guid('rel:Calendar')}`, `\tfromColumn: ${refCol(dateTbl.name, modelSpec.dateColumn.column)}`, '\ttoColumn: Calendar.Date', ''].join('\n'));
if (relLines.length) wtmdl(path.join(smDir, 'definition', 'relationships.tmdl'), relLines.join('\n'));

// model.tmdl
const refs = [...tables.map((t) => `ref table ${tq(t.name)}`), ...(calendarName ? ['ref table Calendar'] : []), 'ref expression DataFolder'];
wtmdl(path.join(smDir, 'definition', 'model.tmdl'), `model Model\n\tculture: en-US\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\tdiscourageImplicitMeasures\n\tsourceQueryCulture: en-US\n\n${refs.join('\n')}\n`);

// ---- report ----
const pageIds = []; let visualCount = 0; const pageSummary = []; let templateInfo = null;
wjson(path.join(repDir, 'definition.pbir'), { $schema: SCHEMA.pbir, version: '4.0', datasetReference: { byPath: { path: '../' + projectName + '.SemanticModel' } } });
if (templateMode) {
  // --- dựng theo template: giữ nguyên giao diện, gắn lại dữ liệu ---
  const model = TPL.makeModel([...tables.map((t) => ({ name: t.name, columns: t.columns.map((c) => c.name) })), ...(hasCalendar ? [{ name: 'Calendar', columns: CALENDAR_COLS.map((c) => c.name) }] : [])], measures.map((m) => ({ name: m.name, table: m.table })));
  let useSpec = spec;
  if (!spec.bind || typeof spec.bind !== 'object' || !Object.keys(spec.bind).length) { console.log('Model không cung cấp "bind" hợp lệ → tự gắn dữ liệu theo quy tắc mặc định'); useSpec = { ...spec, bind: autoBind(tpl) }; templateInfo = { auto: true }; }
  const res = TPL.applyTemplate({ template: tpl, spec: useSpec, model, outReportDir: repDir, userColors: run.form.colorMode === 'own' && COLORS.length === 5 ? COLORS : null, warn });
  templateInfo = { ...(templateInfo || {}), name: tpl.name, id: tpl.id, pages: res.pageNames, clones: res.clones, bound: res.bound, dropped: res.dropped, resources: res.resources, summary: res.summary, ownColors: run.form.colorMode === 'own' };
  topNNotes.forEach((n) => console.log('Top N: ' + n));
  if (approvedPlan && Array.isArray(approvedPlan.pages)) { const planned = approvedPlan.pages.reduce((n, p) => n + p.visuals.filter((v) => !v.remove && v.slot).length, 0); if (res.bound < planned) warn(`Bố cục đã duyệt có ${planned} biểu đồ nhưng chỉ gắn được ${res.bound} — các ô còn lại bị bỏ (xem cảnh báo phía trên)`); }
  if (approvedPlan && Array.isArray(approvedPlan.pages) && approvedPlan.pages.length !== res.pages) warn(`Bố cục đã duyệt có ${approvedPlan.pages.length} trang nhưng bản dựng có ${res.pages} trang — kiểm tra pages.keep / pages.clones trong dashboard-spec.json`);
  wjson(path.join(repDir, 'definition.pbir'), { $schema: SCHEMA.pbir, version: '4.0', datasetReference: { byPath: { path: '../' + projectName + '.SemanticModel' } } });
  // thống kê trang / biểu đồ đã ghi
  const pdir = path.join(repDir, 'definition', 'pages');
  for (const pid of readJson(path.join(pdir, 'pages.json')).pageOrder) {
    pageIds.push(pid); const pj = readJson(path.join(pdir, pid, 'page.json')); const kinds = {}; let n = 0;
    const vd = path.join(pdir, pid, 'visuals');
    if (fs.existsSync(vd)) for (const d of fs.readdirSync(vd)) { const v = readJson(path.join(vd, d, 'visual.json')); const t = v.visual ? v.visual.visualType : 'group'; kinds[t] = (kinds[t] || 0) + 1; n++; }
    pageSummary.push({ name: pj.displayName, visuals: n, kinds }); visualCount += n;
  }
} else {
const theme = { name: 'BIE_Theme', dataColors: COLORS.length === 5 ? [...COLORS, '#8D959E', '#BFC4CA', '#4A5568'] : ['#0D1726', '#1E2A3A', '#C8A96B', '#EDE6D6', '#8D959E', '#BFC4CA', '#4A5568', '#2F9A70'], background: '#FFFFFF', foreground: COLORS[0] || '#0D1726', tableAccent: COLORS[2] || '#C8A96B' };
wjson(path.join(repDir, 'StaticResources', 'RegisteredResources', 'BIE_Theme.json'), theme);
wjson(path.join(repDir, 'definition', 'version.json'), { $schema: SCHEMA.version, version: VERSION_JSON });
wjson(path.join(repDir, 'definition', 'report.json'), {
  $schema: SCHEMA.report,
  themeCollection: { customTheme: { name: 'BIE_Theme.json', reportVersionAtImport: THEME_VERSION, type: 'RegisteredResources' } },
  resourcePackages: [{ name: 'RegisteredResources', type: 'RegisteredResources', items: [{ name: 'BIE_Theme.json', path: 'BIE_Theme.json', type: 'CustomTheme' }] }],
});
for (const [pi, pg] of spec.pages.entries()) {
  const pid = id20('page:' + (pg.id || pg.name || pi)); pageIds.push(pid);
  wjson(path.join(repDir, 'definition', 'pages', pid, 'page.json'), { $schema: SCHEMA.page, name: pid, displayName: String(pg.name || pg.id || 'Page ' + (pi + 1)), displayOption: 'FitToPage', height: PAGE_H, width: PAGE_W });
  let z = 0, kpiN = 0; const kinds = {};
  for (const v of pg.visuals || []) {
    if (v.type === 'card' && ++kpiN > 6) { warn(`Trang "${pg.name}": thẻ KPI "${v.title || v.id}" vượt quy tắc tối đa 6 thẻ KPI mỗi trang → bỏ`); continue; }
    const bv = buildVisual(v, pid, z); if (!bv) continue; z++; visualCount++;
    kinds[bv.json.visual.visualType] = (kinds[bv.json.visual.visualType] || 0) + 1;
    wjson(path.join(repDir, 'definition', 'pages', pid, 'visuals', bv.name, 'visual.json'), bv.json);
  }
  pageSummary.push({ name: pg.name || pg.id, visuals: z, kinds });
}
wjson(path.join(repDir, 'definition', 'pages', 'pages.json'), { $schema: SCHEMA.pages, pageOrder: pageIds, activePageName: pageIds[0] });
}

// tự gắn dữ liệu khi model không cung cấp "bind" (quy tắc đơn giản, chỉ để luôn có kết quả dùng được)
function autoBind(t) {
  const base = measures.filter((m) => m.kind === 'base' || m.kind === 'performance');
  const prim = base.filter((m) => /\((SUM|DISTINCTCOUNT)\)$/.test(m.name) || m.kind === 'performance');
  const pool = prim.length ? prim : base;
  const dims = ((mjson && mjson.dimensions) || []).filter((d) => canon(d.table, d.column));
  const catDims = dims.filter((d) => !d.isDate);
  const bind = {}; let mi = 0, di = 0, si = 0; const kpiPerPage = new Map();
  if (!pool.length) return bind;
  const SKIP = /^(map|shapeMap|filledMap|azureMap|decompositionTreeVisual|keyDriversVisual)$/;
  for (const p of t.manifest.pages.filter((x) => !x.tooltip)) for (const v of p.visuals.filter((x) => x.kind === 'data' && !SKIP.test(x.type))) {
    const roles = {}; const isSlicer = /slicer/i.test(v.type);
    if (/^(card|cardVisual|kpi)$/.test(v.type)) { const n = kpiPerPage.get(p.no) || 0; if (n >= 6) continue; kpiPerPage.set(p.no, n + 1); } // tối đa 6 thẻ KPI mỗi trang
    for (const [role, info] of Object.entries(v.roles)) {
      if (info.kind === 'measure') roles[role] = Array.from({ length: Math.min(info.count, 3) }, () => pool[mi++ % pool.length].name);
      else if (isSlicer) { const c = hasCalendar && si % 2 === 0 ? { table: 'Calendar', column: 'Year' } : (catDims.length ? { table: catDims[si % catDims.length].table, column: catDims[si % catDims.length].column } : null); si++; if (c) roles[role] = [c]; }
      else if (/^(Category|Group|Rows|Axis)$/.test(role)) {
        const timey = /line|area/i.test(v.type) && hasCalendar;
        const c = timey ? { table: 'Calendar', column: 'YearMonth' } : (catDims.length ? { table: catDims[di % catDims.length].table, column: catDims[di++ % catDims.length].column } : (hasCalendar ? { table: 'Calendar', column: 'Year' } : null));
        if (c) roles[role] = [c];
      }
    }
    if (Object.keys(roles).length) bind[v.key] = { roles };
  }
  return bind;
}

// ---- script đặt lại DataFolder khi chuyển máy ----
try { fs.copyFileSync(path.join(SKILL_DIR, 'assets', 'SetDataFolder.ps1'), path.join(root, 'SetDataFolder.ps1')); } catch (e) { warn('Không chép được SetDataFolder.ps1: ' + e.message); }

// ---- README ----
wtext(path.join(root, 'README.md'), `# ${spec.title || projectName}

Project Power BI (PBIP) do BIE dựng tự động.

## Mở dự án
1. Power BI Desktop → **File → Options → Preview features** → bật **Power BI Project (.pbip) save option** và **Store reports using enhanced metadata format (PBIR)** (nếu bản của bạn còn yêu cầu).
2. **File → Open report → Browse** → chọn \`${projectName}.pbip\`.
3. **Lần đầu mở, báo cáo hiện trống số liệu — bấm Home → Refresh (Làm mới) một lần để nạp dữ liệu.** Đây là bình thường: PBIP không lưu sẵn bản dữ liệu đã nạp.
4. Nếu Refresh báo không tìm thấy file (ví dụ khi đã chuyển project sang máy / thư mục khác): chạy \`powershell -ExecutionPolicy Bypass -File .\\SetDataFolder.ps1\` trong thư mục này (trước khi mở \`.pbip\`), hoặc trong Desktop: **Transform data → Edit parameters** → đặt \`DataFolder\` = đường dẫn tuyệt đối tới thư mục \`data\` cạnh file này (đường dẫn lúc dựng: \`${dataFolder}\`).

## Cấu trúc
- \`${projectName}.pbip\` — file mở project
- \`${projectName}.Report/\` — báo cáo (định dạng PBIR): ${pageSummary.length} trang, ${visualCount} biểu đồ
- \`${projectName}.SemanticModel/\` — mô hình dữ liệu (định dạng TMDL): ${tables.length} bảng${hasCalendar ? ' + bảng Calendar' : ''}, ${measures.length} measure
- \`data/\` — dữ liệu đã làm sạch (CSV)

## Lưu ý
${templateInfo && templateInfo.name ? 'Giao diện lấy từ template "' + templateInfo.name + '" (nền, hình, logo, nút chuyển trang, màu theme, định dạng biểu đồ được giữ nguyên); chỉ dữ liệu được gắn lại. Bookmark, drillthrough và bộ lọc riêng của template không được mang theo.\n\n' : ''}Project được sinh tự động theo schema PBIR/TMDL công bố của Microsoft; hãy mở bằng Power BI Desktop bản mới và kiểm tra lại. Phiên bản schema chỉnh được ở \`skills/04-dashboard-pbip/references/pbir-config.json\`.
`);

// ============ tự kiểm tra ============
const problems = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(root);
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (/\.(json|pbip|pbir|pbism)$/i.test(f)) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { problems.push(`JSON lỗi: ${rel} — ${e.message}`); } }
  if (/\.tmdl$/i.test(f)) {
    const txt = fs.readFileSync(f, 'utf8');
    if (/^ +\S/m.test(txt.replace(/\r/g, ''))) problems.push(`TMDL thụt lề bằng dấu cách (phải là tab): ${rel}`);
    if (!/^(table|database|model|relationship|expression)\b/m.test(txt)) problems.push(`TMDL không có khai báo gốc: ${rel}`);
  }
}
const pbir = readJson(path.join(repDir, 'definition.pbir'));
if (!fs.existsSync(path.resolve(repDir, pbir.datasetReference.byPath.path))) problems.push('definition.pbir trỏ tới semantic model không tồn tại');
if (!pageIds.length) problems.push('Báo cáo không có trang nào');
if (!visualCount) problems.push('Báo cáo không có biểu đồ hợp lệ nào');
const pagesJ = readJson(path.join(repDir, 'definition', 'pages', 'pages.json'));
for (const p of pagesJ.pageOrder) if (!fs.existsSync(path.join(repDir, 'definition', 'pages', p, 'page.json'))) problems.push('pages.json trỏ tới trang không tồn tại: ' + p);
{
  // tham chiếu "treo": báo cáo còn trỏ tới bảng không có trong mô hình
  const known = new Set([...tables.map((t) => t.name.toLowerCase()), ...(hasCalendar ? ['calendar'] : [])]); const bad = new Map();
  for (const f of files) {
    if (!/\.json$/i.test(f) || !/\.Report[\\/]/.test(f) || /StaticResources/.test(f)) continue;
    const txt = fs.readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/"Entity":\s*"([^"]+)"/g)) if (!known.has(m[1].toLowerCase())) bad.set(m[1], (bad.get(m[1]) || 0) + 1);
  }
  for (const [e, n] of bad) problems.push(`Báo cáo còn tham chiếu tới bảng "${e}" không có trong mô hình (${n} chỗ)`);
}
const names = new Set(); for (const t of tables) { if (names.has(t.name.toLowerCase())) problems.push('Trùng tên bảng: ' + t.name); names.add(t.name.toLowerCase()); }

// kiểm tra schema chính thức của Microsoft (cần mạng; không bắt buộc)
// đối chiếu với hồ sơ người xem (lib/audience.js, tính từ level + thâm niên) — chỉ cảnh báo, không chặn
try {
  const AUD = require(path.join(process.env.BIE_ROOT || path.resolve(__dirname, '..', '..', '..'), 'lib', 'audience.js'));
  const kpiOf = (k) => ['card', 'cardVisual', 'kpi'].reduce((s, t) => s + (k[t] || 0), 0);
  AUD.checkDashboard((run.form && run.form.audience) || {}, pageSummary.map((p) => ({ name: p.name, visuals: p.visuals, kpis: kpiOf(p.kinds) }))).forEach((w) => warn('Người xem: ' + w));
} catch (e) { warn('Không đối chiếu được hồ sơ người xem: ' + e.message); }
// ngôn ngữ dashboard: chữ HIỂN THỊ (không phải tham chiếu bảng/cột) phải đúng ngôn ngữ đã chọn
if (EN) {
  const VN = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
  const SHOW = new Set(['title', 'subtitle', 'text', 'referenceTitle', 'label', 'caption', 'heading', 'pageTitle', 'displayName']);
  const hits = [];
  const walkSpec = (n, p) => { if (Array.isArray(n)) n.forEach((x, i) => walkSpec(x, p + '[' + i + ']')); else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { if (typeof v === 'string') { if ((SHOW.has(k) || (k === 'name' && /pages[d+]$/.test(p))) && VN.test(v)) hits.push(p + '.' + k + ' = "' + v.slice(0, 50) + '"'); } else walkSpec(v, p + '.' + k); } };
  walkSpec(spec, 'spec');
  if (hits.length) { warn('Ngôn ngữ dashboard = English nhưng còn chữ tiếng Việt: ' + hits.slice(0, 6).join('; ') + (hits.length > 6 ? ' …(+' + (hits.length - 6) + ')' : '')); }
}
// kiểm tra cơ học bản build (lỗi làm Desktop không mở được / nạp 0 dòng / quy tắc KPI)
const vb = require('./validate_build.js').validateBuild(root);
vb.hard.forEach((h) => problems.push('Build: ' + h));
vb.warn.forEach((w) => warn('Build: ' + w));
let schemaNote = '';
if (process.env.BIE_SKIP_SCHEMA) schemaNote = '⏭ Bỏ qua kiểm tra schema (BIE_SKIP_SCHEMA).';
else try {
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'validate_schema.js'), root], { encoding: 'utf8', timeout: 90000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  const outLines = out.split('\n');
  if (r.status === 0) schemaNote = '✅ ' + outLines[outLines.length - 1];
  else if (r.status === 3) schemaNote = '⏭ Bỏ qua kiểm tra schema Microsoft (không có mạng).';
  else if (r.status === 1 && /Schema Microsoft: \d+ file hợp lệ, [1-9]\d* file lỗi/.test(out)) { schemaNote = '❌ Sai schema Microsoft:\n' + outLines.map((l) => '    ' + l).join('\n'); problems.push('Sai schema Microsoft (xem pbip-validation.md)'); }
  else schemaNote = '⏭ Không chạy được validate_schema.js: ' + out.slice(0, 200);
} catch (e) { schemaNote = '⏭ Không chạy được validate_schema.js: ' + e.message; }

const V = [`# Kiểm tra project PBIP`, '', `- Project: \`pbip/${projectName}/${projectName}.pbip\``, `- Bảng dữ liệu: ${tables.length}${hasCalendar ? ' + Calendar' : ''} · Quan hệ: ${relLines.length} · Measure: ${measures.length}`, `- Trang: ${pageSummary.length} · Biểu đồ: ${visualCount}${spec.autoGenerated ? ' (dashboard tự sinh mặc định)' : ''}`, `- File sinh ra: ${files.length}`, ...(templateInfo && templateInfo.name ? [`- Template: **${templateInfo.name}** — giữ ${templateInfo.pages.length} trang (${templateInfo.pages.join(', ')}); gắn dữ liệu ${templateInfo.bound} biểu đồ, bỏ ${templateInfo.dropped} phần${templateInfo.auto ? ' (tự gắn theo quy tắc mặc định vì model không cung cấp bind hợp lệ)' : ''}${templateInfo.ownColors ? '; theme dùng 5 màu của người dùng' : '; giữ màu theme của template'}`] : []), ''];
pageSummary.forEach((p) => V.push(`  - Trang "${p.name}": ${p.visuals} biểu đồ (${Object.entries(p.kinds).map(([k, n]) => k + '×' + n).join(', ') || '—'})`));
V.push('', '## Kiểm tra schema chính thức của Microsoft', schemaNote);
V.push('', problems.length ? '## ❌ Vấn đề cấu trúc' : '## ✅ Không phát hiện vấn đề cấu trúc (JSON hợp lệ, tham chiếu nội bộ khớp)', ...problems.map((p) => '- ' + p));
if (warnings.length) V.push('', '## ⚠ Cảnh báo', ...warnings.map((w) => '- ' + w));
V.push('', '> Script chỉ kiểm tra được cấu trúc file. Việc Power BI Desktop có mở được project hay không cần thử trực tiếp trên máy có Power BI Desktop.');
wtext(path.join(stageDir, 'pbip-validation.md'), V.join('\n') + '\n');
// nối kết quả dựng PBIP vào result.md (xóa bản cũ nếu chạy lại)
{
  const rp = path.join(stageDir, 'result.md'); const MARK = '<!-- AUTO-GENERATED:BEGIN -->';
  if (fs.existsSync(rp)) {
    let md = fs.readFileSync(rp, 'utf8'); const i = md.indexOf(MARK); if (i >= 0) md = md.slice(0, i).trimEnd() + '\n';
    const T = ['', MARK, '## Kết quả dựng PBIP (tự sinh bởi scripts/post.js)', '', `- Project: \`pbip/${projectName}/${projectName}.pbip\` (mở bằng Power BI Desktop)`, `- ${tables.length} bảng${hasCalendar ? ' + Calendar' : ''} · ${relLines.length} quan hệ · ${measures.length} measure · ${pageSummary.length} trang · ${visualCount} biểu đồ${spec.autoGenerated ? ' (dashboard mặc định do model không xuất dashboard-spec.json hợp lệ)' : ''}`, ...(templateInfo && templateInfo.name ? [`- Template: **${templateInfo.name}** — giữ ${templateInfo.pages.length} trang (${templateInfo.pages.join(', ')}); gắn dữ liệu ${templateInfo.bound} biểu đồ, bỏ ${templateInfo.dropped} phần không phù hợp${templateInfo.auto ? ' (tự gắn mặc định vì model không cung cấp bind hợp lệ)' : ''}`] : []), `- Kiểm tra: \`pbip-validation.md\` — ${problems.length ? '❌ ' + problems.length + ' vấn đề' : '✅ không có vấn đề cấu trúc'}`, `- Schema Microsoft: ${schemaNote.split('\n')[0]}`, '- ⚠ **Lần đầu mở bằng Power BI Desktop: báo cáo trống số liệu cho đến khi bấm Home → Refresh (Làm mới).** Chuyển sang máy/thư mục khác: chạy `SetDataFolder.ps1` trong thư mục project.'];
    pageSummary.forEach((p) => T.push(`- Trang "${p.name}": ${p.visuals} biểu đồ (${Object.entries(p.kinds).map(([k, n]) => k + '×' + n).join(', ') || '—'})`));
    if (warnings.length) T.push('', '### Cảnh báo', ...warnings.map((w) => '- ' + w));
    T.push('<!-- AUTO-GENERATED:END -->', '');
    fs.writeFileSync(rp, md + T.join('\n'), 'utf8');
  }
}
console.log(`PBIP: pbip/${projectName}/ — ${tables.length} bảng, ${relLines.length} quan hệ, ${measures.length} measure, ${pageSummary.length} trang, ${visualCount} biểu đồ; ${problems.length} vấn đề cấu trúc, ${warnings.length} cảnh báo`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
