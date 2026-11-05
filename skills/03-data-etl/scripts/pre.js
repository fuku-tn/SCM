#!/usr/bin/env node
/**
 * Stage 3 · Data (ETL) — pre.js
 * Chạy TRƯỚC lượt trả lời của model (không tốn token).
 *
 *   node pre.js <runDir> <stageDir>
 *
 * 1) TRANSFORMATION: đọc các bảng/sheet người dùng đã chọn, làm sạch theo 9 quy tắc "dữ liệu dạng bảng"
 *    và ghi ra  <stageDir>/clean/<bảng>.csv
 * 2) MODELING: nếu có > 1 bảng, tìm quan hệ (Primary/Foreign key) có thể tạo; nếu gặp vấn đề về khóa
 *    thì QUAY LẠI bước transformation (chuẩn hóa khóa) và kiểm tra lại, tối đa 3 vòng.
 * 3) Ghi  <stageDir>/data-checks.json  và in bản tóm tắt Markdown ra stdout (server đưa vào prompt).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const runDir = process.argv[2], stageDir = process.argv[3];
if (!runDir || !stageDir) { console.error('Usage: node pre.js <runDir> <stageDir>'); process.exit(2); }

const run = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'));
const inDir = path.join(runDir, '00-input');
const wanted = (run.form && run.form.sheets && run.form.sheets.length) ? run.form.sheets : null;

// ---------- tiện ích ----------
const RULES = [
  'R1 Mỗi cột có tiêu đề riêng',
  'R2 Không có tiêu đề / hàng / cột trống hoàn toàn',
  'R3 Tiêu đề cột không chứa công thức',
  'R4 Không dùng ô gộp (Merged Cells)',
  'R5 Mỗi cột chỉ chứa một loại thông tin',
  'R6 Mỗi cột dùng một định dạng thống nhất (Tabular Form)',
  'R7 Không có dữ liệu thì để trống, không điền giá trị thay thế',
  'R8 Không có dòng Tổng cộng / Tổng phụ',
  'R9 Không dùng định dạng trình bày (màu sắc, tô màu...) để phân loại dữ liệu',
];
const PLACEHOLDER = /^(n\/?a|na|null|none|nil|nan|-+|—|–|\?+|#n\/a|#value!|#div\/0!|#ref!|#name\?|#num!|\(blank\)|\(trống\)|không có dữ liệu|khong co du lieu|chưa có|chua co)$/i;
const TOTAL_LABEL = /^\s*(tổng cộng|tổng phụ|tổng|tong cong|tong phu|tong|cộng|grand\s*total|sub\s*-?\s*total|total|subtotal|sum)\b[\s:.\-)]*/i;
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const pad = (n) => String(n).padStart(2, '0');
const stripDia = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const safeFile = (s) => stripDia(s).replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '') || 'table';
const safeTable = (s) => String(s).replace(/['"\\\/:*?<>|\[\]\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Table';
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const isoDateTime = (d) => `${isoDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

// ---------- tìm file dữ liệu ----------
function findDataFile() {
  const dirs = [path.join(inDir, 'data'), inDir];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const f = fs.readdirSync(d).find((n) => /\.(csv|tsv|xlsx|xls|xlsm)$/i.test(n) && (!run.file || n === run.file || d.endsWith('data')));
    if (f) return path.join(d, f);
  }
  return null;
}

// ---------- đọc một sheet thành lưới ô, kèm thông tin ô gộp / công thức / màu nền ----------
function loadGrid(ws) {
  const out = { rows: [], formulas: new Set(), merges: 0, fills: {} };
  if (!ws || !ws['!ref']) return out;
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const merges = ws['!merges'] || [];
  const mergedVal = {};
  for (const m of merges) {
    const tl = ws[XLSX.utils.encode_cell(m.s)];
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) mergedVal[r + ',' + c] = tl ? tl.v : null;
    out.merges += (m.e.r - m.s.r + 1) * (m.e.c - m.s.c + 1) - 1;
  }
  for (let r = rg.s.r; r <= rg.e.r; r++) {
    const row = [];
    for (let c = rg.s.c; c <= rg.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      let v = cell ? cell.v : null;
      if (cell && cell.f) out.formulas.add((r - rg.s.r) + ',' + (c - rg.s.c));
      if ((v === null || v === undefined) && mergedVal[r + ',' + c] !== undefined) v = mergedVal[r + ',' + c]; // gỡ ô gộp: điền lại giá trị
      if (cell && cell.s && cell.s.fgColor && cell.s.fgColor.rgb && cell.s.patternType === 'solid') out.fills[(r - rg.s.r) + ',' + (c - rg.s.c)] = String(cell.s.fgColor.rgb);
      row.push(v === undefined ? null : v);
    }
    out.rows.push(row);
  }
  return out;
}

// ---------- phân tích kiểu giá trị ----------
function parseNumber(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/[\u00a0\s]/g, '');
  if (!s) return null;
  let pct = false;
  if (/%$/.test(s)) { pct = true; s = s.slice(0, -1); }
  s = s.replace(/^[₫$€£¥]|[₫$€£¥]$|(vnđ|vnd|usd|đ)$/ig, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(',');
  if (lastDot >= 0 && lastCom >= 0) { // có cả hai: dấu xuất hiện sau cùng là dấu thập phân
    if (lastDot > lastCom) s = s.replace(/,/g, ''); else s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastCom >= 0) {
    const parts = s.split(',');
    if (parts.length > 2 || (parts.length === 2 && /^\d{3}$/.test(parts[1]) && parts[0].replace(/[-+]/, '').length <= 3 && parts[0].replace(/[-+]/, '').length > 0)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return (neg ? -n : n) / (pct ? 100 : 1);
}
const looksLikeCode = (s) => typeof s === 'string' && (/^0\d+$/.test(s.trim()) || /^\d{12,}$/.test(s.trim()));
function parseDate(v, dayFirst) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    let d = dayFirst ? a : b, mo = dayFirst ? b : a;
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  }
  return null;
}
function excelSerialDate(n) { return new Date(Math.round((n - 25569) * 86400 * 1000)); }

// ---------- làm sạch một sheet ----------
function cleanSheet(name, grid) {
  const log = { rules: {}, actions: [] };
  const setRule = (i, status, detail) => { const k = RULES[i]; const cur = log.rules[k]; const rank = { pass: 0, fixed: 1, warn: 2 }; if (!cur || rank[status] > rank[cur.status]) log.rules[k] = { status, detail: detail || '' }; };
  RULES.forEach((_, i) => setRule(i, 'pass', ''));
  let rows = grid.rows.map((r) => r.slice());
  const rowsBefore = rows.length;

  // R4 ô gộp
  if (grid.merges > 0) { setRule(3, 'fixed', `Đã gỡ ${grid.merges} ô gộp và điền lại giá trị`); log.actions.push(`Gỡ ô gộp: ${grid.merges} ô`); }

  // tìm dòng tiêu đề: dòng đầu tiên có nhiều ô chữ, đứng trước dữ liệu
  const sample = rows.slice(0, 60);
  const stat = (r) => { const f = r.filter((v) => !isBlank(v)); return { filled: f.length, distinct: new Set(f.map((v) => String(v))).size, strs: f.filter((v) => typeof v === 'string').length }; };
  const stats = sample.map(stat);
  const maxD = Math.max(1, ...stats.map((x) => x.distinct));
  let hdr = 0;
  for (let r = 0; r < sample.length; r++) {
    const x = stats[r];
    if (x.distinct >= Math.max(maxD === 1 ? 1 : 2, Math.ceil(maxD * 0.6)) && x.strs / Math.max(1, x.filled) >= 0.7) { hdr = r; break; }
  }
  if (hdr > 0) { setRule(5, 'fixed', `Bỏ ${hdr} dòng tiêu đề/ghi chú phía trên bảng`); log.actions.push(`Bỏ ${hdr} dòng phía trên dòng tiêu đề (tiêu đề báo cáo / ghi chú)`); }
  const headerRow = rows[hdr] || [];
  const headerCells = headerRow.map((v, c) => ({ v, f: grid.formulas.has(hdr + ',' + c) }));
  let body = rows.slice(hdr + 1);
  const bodyOffset = hdr + 1;

  // R3 công thức ở tiêu đề
  const hdrFormula = headerCells.filter((h) => h.f).length;
  if (hdrFormula) { setRule(2, 'fixed', `${hdrFormula} tiêu đề chứa công thức → đã thay bằng giá trị`); log.actions.push(`Thay ${hdrFormula} tiêu đề chứa công thức bằng giá trị`); }

  // R2 hàng trống hoàn toàn
  const keepIdx = [];
  body.forEach((r, i) => { if (r.some((v) => !isBlank(v))) keepIdx.push(i); });
  const blankRows = body.length - keepIdx.length;
  if (blankRows) { setRule(1, 'fixed', `Đã xóa ${blankRows} hàng trống hoàn toàn`); log.actions.push(`Xóa ${blankRows} hàng trống`); }
  const colorRows = keepIdx.map((i) => bodyOffset + i);
  body = keepIdx.map((i) => body[i]);

  // R2 cột trống hoàn toàn (cả tiêu đề lẫn dữ liệu)
  const ncol = Math.max(headerRow.length, ...body.map((r) => r.length), 0);
  const colKeep = [];
  for (let c = 0; c < ncol; c++) { if (!isBlank(headerRow[c]) || body.some((r) => !isBlank(r[c]))) colKeep.push(c); }
  if (ncol - colKeep.length > 0) { setRule(1, 'fixed', `${(log.rules[RULES[1]].detail ? log.rules[RULES[1]].detail + '; ' : '')}đã xóa ${ncol - colKeep.length} cột trống hoàn toàn`); log.actions.push(`Xóa ${ncol - colKeep.length} cột trống`); }

  // R1 tiêu đề thiếu / trùng
  const names = []; let blankHdr = 0, dupHdr = 0;
  colKeep.forEach((c, k) => {
    let n = headerRow[c];
    if (n instanceof Date) n = isoDate(n);
    n = isBlank(n) ? '' : String(n).replace(/\s+/g, ' ').trim();
    if (!n) { n = 'Column' + (k + 1); blankHdr++; }
    let base = n, i = 2; while (names.includes(n)) { n = base + '_' + i++; dupHdr++; }
    names.push(n);
  });
  if (blankHdr) { setRule(0, 'fixed', `${blankHdr} cột thiếu tiêu đề → đặt tên Column<n>`); setRule(1, 'fixed', `${blankHdr} tiêu đề trống`); log.actions.push(`Đặt tên cho ${blankHdr} cột thiếu tiêu đề`); }
  if (dupHdr) { setRule(0, 'fixed', `${dupHdr} tiêu đề trùng → thêm hậu tố _2, _3`); log.actions.push(`Đổi tên ${dupHdr} tiêu đề trùng`); }

  let data = body.map((r) => colKeep.map((c) => (r[c] === undefined ? null : r[c])));

  // R9 màu nền dùng để phân loại (chỉ kiểm tra được với file Excel còn thông tin style)
  const fillsByCol = {};
  colorRows.forEach((gr, ri) => colKeep.forEach((c, k) => { const f = grid.fills[gr + ',' + c]; if (f) { (fillsByCol[k] = fillsByCol[k] || new Set()).add(f); } }));
  const colored = Object.keys(fillsByCol).filter((k) => fillsByCol[k].size >= 2);
  if (colored.length) setRule(8, 'warn', `Cột ${colored.map((k) => names[k]).join(', ')} có ≥2 màu nền khác nhau — có thể đang dùng màu để phân loại; cần tạo cột phân loại thật`);
  else if (/\.(xlsx|xls|xlsm)$/i.test(run.file || '')) setRule(8, 'pass', 'Không phát hiện màu nền phân loại (script chỉ kiểm tra được màu nền ô)');
  else setRule(8, 'pass', 'CSV không chứa định dạng');

  // R8 dòng tổng cộng / tổng phụ
  const isTotalRow = (r, idx) => {
    const labels = r.slice(0, 3).filter((v) => typeof v === 'string' && v.trim());
    if (labels.some((v) => TOTAL_LABEL.test(v))) return true;
    if (idx === data.length - 1) { // dòng cuối: các cột số đều bằng tổng các dòng phía trên
      let hit = 0, tested = 0;
      for (let k = 0; k < r.length; k++) {
        const n = parseNumber(r[k]); if (n === null || typeof r[k] === 'string') continue;
        const above = data.slice(0, idx).map((x) => parseNumber(x[k])).filter((x) => x !== null);
        if (above.length < 3) continue; tested++;
        const sum = above.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - n) <= Math.abs(sum) * 0.005 + 1e-9) hit++;
      }
      return tested >= 2 && hit >= 2 && hit === tested;
    }
    return false;
  };
  const before = data.length;
  data = data.filter((r, i) => !isTotalRow(r, i));
  if (before - data.length) { setRule(7, 'fixed', `Đã xóa ${before - data.length} dòng Tổng cộng / Tổng phụ`); log.actions.push(`Xóa ${before - data.length} dòng tổng cộng/tổng phụ`); }

  // R7 giá trị thay thế cho "không có dữ liệu" → để trống
  let placeholders = 0;
  data = data.map((r) => r.map((v) => { if (typeof v === 'string') { if (v.trim() === '') return null; if (PLACEHOLDER.test(v.trim())) { placeholders++; return null; } } return v; }));
  if (placeholders) { setRule(6, 'fixed', `Đã chuyển ${placeholders} giá trị thay thế (N/A, -, null...) thành ô trống`); log.actions.push(`Chuyển ${placeholders} giá trị thay thế thành ô trống`); }

  // R5/R6: chuẩn hóa từng cột về một kiểu duy nhất
  const columns = [];
  let dayFirstGuess = true;
  const dateNotes = [];
  names.forEach((name, k) => {
    const vals = data.map((r) => r[k]);
    const nn = vals.filter((v) => !isBlank(v));
    const total = nn.length;
    const col = { name, type: 'text', nulls: vals.length - total, fixes: [] };
    if (!total) { col.type = 'text'; columns.push({ col, out: vals.map(() => '') }); return; }

    // ngày
    const dateLike = nn.filter((v) => v instanceof Date || (typeof v === 'string' && parseDate(v, dayFirstGuess))).length;
    const dateSerial = (/(ngày|ngay|date|thời gian|time|kỳ|period)/i.test(name) || /^\s*(ngày|date)/i.test(name)) ? nn.filter((v) => typeof v === 'number' && v > 20000 && v < 80000).length : 0;
    if ((dateLike + dateSerial) / total >= 0.8) {
      let hasTime = false;
      const parsed = vals.map((v) => {
        if (isBlank(v)) return null;
        let d = v instanceof Date ? v : (typeof v === 'number' && dateSerial ? excelSerialDate(v) : parseDate(v, dayFirstGuess));
        if (d && (d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds())) hasTime = true;
        return d;
      });
      const failed = parsed.filter((d, i) => d === null && !isBlank(vals[i])).length;
      if (failed) { col.fixes.push(`${failed} giá trị không phải ngày → để trống`); }
      const slashStr = nn.filter((v) => typeof v === 'string' && /^\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}/.test(v));
      if (slashStr.length) dateNotes.push(`${name}: định dạng ngày/tháng/năm được hiểu theo dd/mm/yyyy`);
      const kinds = new Set(nn.map((v) => (v instanceof Date ? 'date' : typeof v === 'number' ? 'serial' : /^\d{4}-/.test(v) ? 'iso' : 'dmy')));
      if (kinds.size > 1) col.fixes.push('trộn nhiều kiểu ghi ngày → đã thống nhất yyyy-mm-dd');
      col.type = hasTime ? 'datetime' : 'date';
      columns.push({ col, out: parsed.map((d) => (d ? (hasTime ? isoDateTime(d) : isoDate(d)) : '')) });
      return;
    }

    // số
    const nums = vals.map((v) => (isBlank(v) ? null : (looksLikeCode(v) ? null : parseNumber(v))));
    const numOk = nn.filter((v, i) => true).length; // placeholder để rõ nghĩa
    const parsedCount = vals.filter((v, i) => !isBlank(v) && nums[i] !== null).length;
    const codeCount = nn.filter((v) => looksLikeCode(v)).length;
    const textCount = total - parsedCount - codeCount;
    if (parsedCount / total >= 0.9 && codeCount === 0) {
      const bad = total - parsedCount;
      const strNum = nn.filter((v) => typeof v === 'string').length;
      if (bad) col.fixes.push(`${bad} giá trị không phải số → để trống`);
      if (strNum) col.fixes.push(`${strNum} số đang lưu dạng chữ → đã chuyển thành số`);
      const allInt = nums.filter((n) => n !== null).every((n) => Number.isInteger(n));
      col.type = allInt ? 'int' : 'decimal';
      columns.push({ col, out: nums.map((n) => (n === null ? '' : String(Math.round(n * 1e10) / 1e10))) });
      return;
    }
    if (parsedCount / total > 0.1 && parsedCount / total < 0.9) col.mixed = `Trộn số (${parsedCount}) và chữ (${textCount + codeCount}) trong cùng một cột`;

    // text
    const outT = vals.map((v) => (isBlank(v) ? '' : String(v instanceof Date ? isoDate(v) : v).replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim()));
    const numTyped = nn.filter((v) => typeof v === 'number').length;
    if (numTyped && numTyped < total) col.fixes.push(`${numTyped} số lẫn trong cột chữ → đã chuyển thành chữ`);
    if (codeCount) col.fixes.push('mã có số 0 đầu / chuỗi số dài → giữ nguyên dạng chữ (không chuyển thành số)');
    col.type = 'text';
    columns.push({ col, out: outT });
  });

  const mixedCols = columns.filter((c) => c.col.mixed);
  if (mixedCols.length) setRule(4, 'warn', `Cột trộn nhiều loại thông tin: ${mixedCols.map((c) => c.col.name + ' (' + c.col.mixed + ')').join('; ')}`);
  const fixedCols = columns.filter((c) => c.col.fixes.length);
  if (fixedCols.length) { setRule(5, mixedCols.length ? 'warn' : 'fixed', fixedCols.map((c) => `${c.col.name}: ${c.col.fixes.join(', ')}`).join(' | ').slice(0, 900)); fixedCols.forEach((c) => c.col.fixes.forEach((f) => log.actions.push(`Cột ${c.col.name}: ${f}`))); }
  dateNotes.forEach((n) => log.actions.push(n));

  const nrows = data.length;
  const table = { header: columns.map((c) => c.col.name), cols: columns.map((c) => c.col), rows: Array.from({ length: nrows }, (_, i) => columns.map((c) => c.out[i])) };
  // thống kê
  table.cols.forEach((c, k) => {
    const vs = table.rows.map((r) => r[k]).filter((x) => x !== '');
    const set = new Set(vs);
    c.nulls = nrows - vs.length; c.distinct = set.size; c.unique = vs.length > 0 && set.size === vs.length && c.nulls === 0;
    if (c.type === 'int' || c.type === 'decimal') { const ns = vs.map(Number); c.min = Math.min(...ns); c.max = Math.max(...ns); c.sum = Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100; }
    else if (c.type === 'date' || c.type === 'datetime') { const s = [...vs].sort(); c.min = s[0]; c.max = s[s.length - 1]; }
    else c.examples = [...set].slice(0, 5);
  });
  return { name, table, log, rowsBefore, rowsAfter: nrows };
}

// ---------- CSV ----------
const csvCell = (s) => (/[",\r\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : s);
const toCsv = (t) => [t.header.map(csvCell).join(','), ...t.rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';

// ---------- modeling: tìm quan hệ PK/FK ----------
const normName = (s) => stripDia(String(s)).toLowerCase().replace(/[^a-z0-9]/g, '');
const keyish = /(id|ma|code|key|sku|no|number)$/;
function colSets(tables) {
  const info = [];
  tables.forEach((t) => t.table.cols.forEach((c, k) => {
    if (!['text', 'int'].includes(c.type)) return;
    const vals = t.table.rows.map((r) => r[k]);
    const nn = vals.filter((v) => v !== '');
    const set = new Set(nn), nset = new Set(nn.map((v) => normalizeKey(v, 3)));
    if (set.size < 2) return;
    info.push({ t: t.name, ti: tables.indexOf(t), k, name: c.name, type: c.type, set, nset, rowsNN: nn.length, blanks: vals.length - nn.length, unique: nn.length > 0 && set.size === nn.length && vals.length === nn.length, rows: vals.length });
  }));
  return info;
}
function findRelationships(tables) {
  const info = colSets(tables), cands = [];
  for (const a of info) for (const b of info) {
    if (a.ti === b.ti) continue;
    const na = normName(a.name), nb = normName(b.name);
    const affinity = na === nb || (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) || (keyish.test(na) && keyish.test(nb));
    if (!affinity) continue;
    // a = phía nhiều (FK), b = phía một (PK). Dò theo dạng đã chuẩn hóa để bắt được lỗi định dạng khóa
    let inBn = 0; for (const v of a.nset) if (b.nset.has(v)) inBn++;
    let inB = 0; for (const v of a.set) if (b.set.has(v)) inB++;
    const coverN = inBn / a.nset.size, cover = inB / a.set.size;
    if (coverN < 0.5) continue;
    const bUniqN = b.nset.size / Math.max(1, b.rowsNN);
    if (bUniqN < 0.98 && !(a.unique === false && b.unique === false)) continue;
    const orphanVals = a.set.size - inB;
    let orphanRows = 0; if (orphanVals) { const t = tables[a.ti].table; t.rows.forEach((r) => { const v = r[a.k]; if (v !== '' && !b.set.has(v)) orphanRows++; }); }
    const card = a.unique && b.unique ? 'oneToOne' : (b.unique ? 'manyToOne' : 'manyToMany');
    const issues = [];
    if (!b.unique) issues.push(`Khóa phía "một" (${b.t}.${b.name}) bị trùng ${b.rowsNN - b.set.size} giá trị / có ${b.blanks} ô trống`);
    if (orphanVals) issues.push(`${orphanVals} giá trị ở ${a.t}.${a.name} (${orphanRows} dòng) không có trong ${b.t}.${b.name}` + (coverN > cover + 1e-9 ? ' — do khác định dạng khóa (khoảng trắng/hoa-thường/số 0 đầu)' : ''));
    if (a.blanks) issues.push(`${a.t}.${a.name} có ${a.blanks} ô trống`);
    cands.push({ from: { table: a.t, column: a.name }, to: { table: b.t, column: b.name }, cardinality: card, coverage: Math.round(cover * 1000) / 10, orphanValues: orphanVals, orphanRows, issues, _a: a, _b: b });
  }
  const seen = new Set(), out = [];
  for (const c of cands.sort((x, y) => y.coverage - x.coverage)) {
    const key = [c.from.table + '.' + c.from.column, c.to.table + '.' + c.to.column].sort().join('|');
    if (seen.has(key)) continue; seen.add(key); out.push(c);
  }
  return out;
}

// chuẩn hóa giá trị khóa (vòng "quay lại transformation")
function normalizeKey(v, mode) {
  let s = String(v).replace(/[\u00a0\u200b\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  if (mode >= 2) s = s.toLowerCase();
  if (mode >= 3 && /^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, '');
  return s;
}
function fixKeys(tables, cands, round) {
  const fixes = [];
  // Đưa khóa NGOẠI về đúng dạng của khóa CHÍNH (không đổi dữ liệu phía khóa chính):
  // vòng 1 cắt khoảng trắng · vòng 2 bỏ phân biệt hoa/thường · vòng 3 bỏ số 0 đầu
  for (const c of cands) {
    if (!c.issues.some((i) => i.includes('không có trong'))) continue;
    const tf = tables.find((x) => x.name === c.from.table), tp = tables.find((x) => x.name === c.to.table);
    const kf = tf.table.header.indexOf(c.from.column), kp = tp.table.header.indexOf(c.to.column);
    if (kf < 0 || kp < 0) continue;
    const pkSet = new Set(), map = new Map(), amb = new Set();
    tp.table.rows.forEach((r) => { const v = r[kp]; if (v === '') return; pkSet.add(v); const n = normalizeKey(v, round); if (map.has(n) && map.get(n) !== v) amb.add(n); else map.set(n, v); });
    let changed = 0;
    tf.table.rows.forEach((r) => {
      const v = r[kf]; if (v === '' || pkSet.has(v)) return;
      const n = normalizeKey(v, round); if (map.has(n) && !amb.has(n)) { r[kf] = map.get(n); changed++; }
    });
    if (changed) fixes.push(`đưa ${changed} giá trị khóa ngoại ${c.from.table}.${c.from.column} về đúng dạng của khóa chính ${c.to.table}.${c.to.column} (${['', 'cắt khoảng trắng', 'bỏ phân biệt hoa/thường', 'bỏ số 0 đầu'][round]})`);
  }
  // vòng 2+: xóa dòng trùng 100% ở bảng phía "một" nếu khóa bị trùng
  if (round >= 2) for (const c of cands) {
    if (c.cardinality !== 'manyToOne' && c.cardinality !== 'oneToOne' && !c.issues.some((i) => i.includes('bị trùng'))) continue;
    if (!c.issues.some((i) => i.includes('bị trùng'))) continue;
    const t = tables.find((x) => x.name === c.to.table); const before = t.table.rows.length; const seen = new Set();
    t.table.rows = t.table.rows.filter((r) => { const key = r.join('\u0001'); if (seen.has(key)) return false; seen.add(key); return true; });
    if (t.table.rows.length < before) fixes.push(`xóa ${before - t.table.rows.length} dòng trùng hoàn toàn ở ${t.name} (để khóa ${c.to.column} duy nhất)`);
  }
  return fixes;
}
// Hai cột khóa của một quan hệ phải cùng kiểu: nếu một bên int và bên kia là chữ toàn số → đưa cả hai về int; ngược lại → cả hai về text
function alignKeyTypes(tables, cands) {
  const notes = [];
  for (const c of cands) {
    const ta = tables.find((x) => x.name === c.from.table), tb = tables.find((x) => x.name === c.to.table);
    const ka = ta.table.header.indexOf(c.from.column), kb = tb.table.header.indexOf(c.to.column);
    const ca = ta.table.cols[ka], cb = tb.table.cols[kb];
    if (ca.type === cb.type) continue;
    const digits = (t, k) => t.table.rows.every((r) => r[k] === '' || /^\d+$/.test(r[k]));
    if (digits(ta, ka) && digits(tb, kb)) {
      [[ta, ka, ca], [tb, kb, cb]].forEach(([t, k, col]) => { if (col.type !== 'int') { t.table.rows.forEach((r) => { if (r[k] !== '') r[k] = String(Number(r[k])); }); col.type = 'int'; } });
      notes.push(`Đồng bộ kiểu khóa ${c.from.table}.${c.from.column} ↔ ${c.to.table}.${c.to.column} về int`);
    } else {
      [ca, cb].forEach((col) => (col.type = 'text'));
      notes.push(`Đồng bộ kiểu khóa ${c.from.table}.${c.from.column} ↔ ${c.to.table}.${c.to.column} về text`);
    }
  }
  return notes;
}
function refreshStats(t) {
  const n = t.table.rows.length; t.rowsAfter = n;
  t.table.cols.forEach((c, k) => { const vs = t.table.rows.map((r) => r[k]).filter((x) => x !== ''); const set = new Set(vs); c.nulls = n - vs.length; c.distinct = set.size; c.unique = vs.length > 0 && set.size === vs.length && c.nulls === 0; });
}

// ======================= MAIN =======================
(function main() {
  fs.mkdirSync(path.join(stageDir, 'clean'), { recursive: true });
  for (const f of fs.readdirSync(path.join(stageDir, 'clean'))) fs.rmSync(path.join(stageDir, 'clean', f), { force: true });
  const file = findDataFile();
  if (!file) { console.error('Không tìm thấy file dữ liệu trong ' + inDir); process.exit(3); }
  const ext = path.extname(file).toLowerCase();
  let wb;
  if (ext === '.csv' || ext === '.tsv') {
    const txt = fs.readFileSync(file, 'utf8').replace(/^\ufeff/, '');
    wb = XLSX.read(txt, { type: 'string', cellDates: true, FS: ext === '.tsv' ? '\t' : undefined });
  } else wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true, cellFormula: true, cellStyles: true });
  let names = wb.SheetNames.slice();
  if (wanted) { const w = names.filter((n) => wanted.includes(n)); if (w.length) names = w; }
  const baseName = path.basename(file, ext);

  const tables = [];
  for (const sn of names) {
    const grid = loadGrid(wb.Sheets[sn]);
    const tname = safeTable((ext === '.csv' || ext === '.tsv') ? baseName : sn);
    const res = cleanSheet(tname, grid);
    res.fileName = safeFile(tname) + '.csv';
    if (res.table.rows.length === 0 && res.table.header.length === 0) { console.error(`Sheet "${sn}" không có dữ liệu — bỏ qua`); continue; }
    tables.push(res);
  }
  if (!tables.length) { console.error('Không có bảng dữ liệu hợp lệ'); process.exit(4); }
  // tên file không trùng
  const used = new Set(); tables.forEach((t) => { let f = t.fileName, i = 2; while (used.has(f)) f = t.fileName.replace(/\.csv$/, '') + '_' + i++ + '.csv'; used.add(f); t.fileName = f; });

  // ----- modeling: kiểm tra quan hệ + vòng lặp quay lại transformation -----
  const rel = { candidates: [], rounds: [], unresolved: [] };
  let cands = [];
  if (tables.length > 1) {
    cands = findRelationships(tables);
    rel.rounds.push({ round: 0, note: 'Kiểm tra ban đầu', candidates: cands.length, withIssues: cands.filter((c) => c.issues.length).length });
    for (let round = 1; round <= 3 && cands.some((c) => c.issues.length); round++) {
      const fixes = fixKeys(tables, cands, round);
      tables.forEach(refreshStats);
      cands = findRelationships(tables);
      rel.rounds.push({ round, note: fixes.length ? fixes : ['Không còn gì để chuẩn hóa tự động'], candidates: cands.length, withIssues: cands.filter((c) => c.issues.length).length });
    }
    const alignNotes = alignKeyTypes(tables, cands);
    if (alignNotes.length) { tables.forEach(refreshStats); rel.rounds.push({ round: 'types', note: alignNotes, candidates: cands.length, withIssues: cands.filter((c) => c.issues.length).length }); }
    cands = findRelationships(tables);
    rel.candidates = cands.map(({ _a, _b, ...r }) => r);
    rel.unresolved = rel.candidates.filter((c) => c.issues.length).map((c) => ({ relationship: `${c.from.table}.${c.from.column} → ${c.to.table}.${c.to.column}`, issues: c.issues }));
    if (!rel.candidates.length) rel.unresolved.push({ relationship: '(không tìm được cặp khóa nào)', issues: ['Không bảng nào có cột khóa chung rõ ràng; cần người dùng/model xác định hoặc tạo cột khóa'] });
  } else rel.rounds.push({ round: 0, note: 'Chỉ có 1 bảng — không cần quan hệ', candidates: 0, withIssues: 0 });

  // ----- ghi file -----
  tables.forEach((t) => fs.writeFileSync(path.join(stageDir, 'clean', t.fileName), toCsv(t.table), 'utf8'));
  const checks = {
    sourceFile: path.basename(file),
    tables: tables.map((t) => ({
      name: t.name, file: 'clean/' + t.fileName, rowsBefore: t.rowsBefore, rowsAfter: t.rowsAfter,
      columns: t.table.cols.map((c) => ({ name: c.name, type: c.type, nulls: c.nulls, distinct: c.distinct, unique: !!c.unique, min: c.min, max: c.max, sum: c.sum, examples: c.examples, mixed: c.mixed })),
      rules: t.log.rules, actions: t.log.actions,
    })),
    relationships: rel,
  };
  fs.writeFileSync(path.join(stageDir, 'data-checks.json'), JSON.stringify(checks, null, 2), 'utf8');

  // ----- tóm tắt cho model (stdout) -----
  const L = [];
  L.push(`File nguồn: ${checks.sourceFile} · ${tables.length} bảng đã làm sạch → thư mục clean/`);
  for (const t of checks.tables) {
    L.push(`\n### Bảng "${t.name}" (${t.file}) — ${t.rowsBefore} → ${t.rowsAfter} dòng`);
    L.push('| Cột | Kiểu | Trống | Distinct | Duy nhất |\n|---|---|---|---|---|');
    t.columns.forEach((c) => L.push(`| ${c.name} | ${c.type}${c.mixed ? ' ⚠' : ''} | ${c.nulls} | ${c.distinct} | ${c.unique ? '✓' : ''} |`));
    L.push('\nKiểm tra 9 quy tắc:');
    RULES.forEach((r) => { const x = t.rules[r]; L.push(`- ${x.status === 'pass' ? '✅' : x.status === 'fixed' ? '🛠' : '⚠'} ${r}${x.detail ? ' — ' + x.detail : ''}`); });
    if (t.actions.length) L.push('\nHành động đã thực hiện: ' + t.actions.slice(0, 20).join('; '));
    const cs = tables.find((x) => x.name === t.name);
    L.push('\nMẫu 5 dòng đầu:\n```csv\n' + [cs.table.header.join(','), ...cs.table.rows.slice(0, 5).map((r) => r.map(csvCell).join(','))].join('\n') + '\n```');
  }
  L.push('\n### Modeling — quan hệ giữa các bảng');
  rel.rounds.forEach((r) => L.push(`- Vòng ${r.round}: ${Array.isArray(r.note) ? r.note.join(' | ') : r.note} → ${r.candidates} ứng viên, ${r.withIssues} có vấn đề`));
  if (rel.candidates.length) {
    L.push('\n| Từ (FK, phía nhiều) | Đến (PK, phía một) | Cardinality | Phủ khóa % | Orphan (giá trị/dòng) | Vấn đề |\n|---|---|---|---|---|---|');
    rel.candidates.forEach((c) => L.push(`| ${c.from.table}.${c.from.column} | ${c.to.table}.${c.to.column} | ${c.cardinality} | ${c.coverage} | ${c.orphanValues}/${c.orphanRows} | ${c.issues.join('; ') || 'không'} |`));
  }
  if (rel.unresolved.length) { L.push('\n**CHƯA XỬ LÝ ĐƯỢC (cần bạn quyết định):**'); rel.unresolved.forEach((u) => L.push(`- ${u.relationship}: ${u.issues.join('; ')}`)); }
  console.log(L.join('\n'));
})();
