'use strict';
/**
 * So sánh với VERSION (Budget / Target / Forecast / Rolling Forecast / Outlook 6 tháng).
 * Luồng: sau chặng Data (ETL) → kiểm tra dữ liệu Version → nếu thiếu thì dừng, hỏi người dùng bổ sung (file mẫu) →
 * có dữ liệu thì sinh measure Version bằng SCRIPT (không để model tự viết DAX).
 *
 * Dữ liệu Version người dùng bổ sung theo "bảng dài" (file mẫu): Date | Version | <Chỉ số 1> | <Chỉ số 2> | …
 * → bảng `Versions` trong mô hình, nối Calendar[Date]. Measure: `<Chỉ số> <Version>`, `<Chỉ số> vs <Version>`, `<Chỉ số> vs <Version> %`.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const noDia = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const VERSIONS = [
  { k: 'BUD', name: 'Budget', vi: 'Ngân sách', re: /\b(budget|ngan sach|bud)\b/ },
  { k: 'TGT', name: 'Target', vi: 'Mục tiêu', re: /\b(target|muc tieu|tgt)\b/ },
  { k: 'RFCST', name: 'Rolling Forecast', vi: 'Dự báo cuốn chiếu', re: /\b(rolling|cuon chieu|rf|rfcst)\b/ },
  { k: 'FCST', name: 'Forecast', vi: 'Dự báo', re: /\b(forecast|du bao|fcst|fc)\b/ },
  { k: 'OUT6', name: 'Outlook (6 months)', vi: 'Triển vọng 6 tháng', re: /\b(outlook|trien vong|out6)\b/ },
];
const byKey = (k) => VERSIONS.find((v) => v.k === k);
/** Nhận diện tên Version trong một chuỗi (Rolling Forecast được thử trước Forecast) */
function versionOf(text) { const n = noDia(text); return VERSIONS.find((v) => v.re.test(n)) || null; }

/** Tìm cột/bảng có dấu hiệu dữ liệu Version trong dữ liệu đã làm sạch (data-checks.json) */
function detect(checks, selected) {
  const found = {}; const missing = [];
  const cols = [];
  for (const t of (checks && checks.tables) || []) for (const c of t.columns || []) cols.push({ table: t.name, column: c.name, type: c.type });
  for (const k of selected || []) {
    const v = byKey(k); if (!v) continue;
    const hit = cols.filter((c) => { const vv = versionOf(c.column); return vv && vv.k === k && (c.type === 'int' || c.type === 'decimal' || c.type === 'number'); });
    if (hit.length) found[k] = hit; else missing.push(k);
  }
  return { found, missing };
}

// ---------------------------------------------------------------- file mẫu
function sampleBuffer({ metrics = [], versions = [], start } = {}) {
  const vs = (versions.length ? versions : ['BUD']).map(byKey).filter(Boolean);
  const ms = metrics.length ? metrics.map((m) => String(m).replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean) : ['Revenue'];
  const d0 = start ? new Date(start) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const first = isNaN(d0) ? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)) : new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  const rows = [['Date', 'Version', ...ms]];
  for (const v of vs) for (let i = 0; i < 3; i++) rows.push([iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1))), v.name, ...ms.map(() => '')]);
  const guide = [
    ['HOW TO FILL THIS FILE / CÁCH ĐIỀN'],
    [''],
    ['1. Sheet "Versions": one row = one month (or period) of ONE version. / Mỗi dòng = một kỳ của MỘT version.'],
    ['2. Date: first day of the period, e.g. 2024-01-01. / Ngày đầu kỳ, ví dụ 2024-01-01.'],
    ['3. Version: ' + vs.map((v) => v.name).join(', ') + ' (keep the spelling). / Giữ nguyên cách viết.'],
    ['4. Metric columns: planned value for that period (numbers only). Add or delete metric columns if needed; names should match your Key Metrics. / Giá trị kế hoạch của kỳ (chỉ số).'],
    ['5. Add as many rows as you need (the 3 rows per version are only examples). Rows with no numbers are ignored. / Thêm bao nhiêu dòng tùy ý; dòng không có số bị bỏ qua.'],
    ['6. Version numbers are compared with actuals BY TIME (Calendar). / Số Version được so với số thực tế theo thời gian.'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 12 }, { wch: 22 }, ...ms.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Versions');
  const wg = XLSX.utils.aoa_to_sheet(guide); wg['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wg, 'Guide');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ---------------------------------------------------------------- đọc file người dùng tải lên
const DATE_ISO = /^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/;
const DATE_DMY = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/;
const MON_Y = /^(\d{1,2})[-\/.](\d{4})$/;
function toIso(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim(); if (!s) return '';
  let m = s.match(DATE_ISO); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3] || 1).padStart(2, '0')}`;
  m = s.match(DATE_DMY); if (m) { let d = +m[1], mo = +m[2]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  m = s.match(MON_Y); if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}-01`;
  return '';
}
const num = (v) => { if (typeof v === 'number') return v; const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return null; const t = s.includes(',') && s.includes('.') ? (s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) : s.replace(',', '.'); const n = Number(t); return isFinite(n) ? n : null; };
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

/** wb: workbook SheetJS (ngày đã đổi sang Date). selected: các key Version người dùng chọn. */
function parseWorkbook(wb, selected = []) {
  const out = { ok: false, errors: [], warnings: [], rows: 0, versions: {}, metrics: [], dims: [], dateMin: null, dateMax: null, columns: [], csv: '', stillMissing: [] };
  const names = wb.SheetNames;
  const want = names.find((n) => /^versions?$/i.test(n.trim())) || names.find((n) => !/^guide|huong dan/i.test(noDia(n))) || names[0];
  const ws = wb.Sheets[want]; if (!ws) { out.errors.push('Không đọc được sheet nào trong file.'); return out; }
  const data = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  if (!data.length) { out.errors.push('Sheet "' + want + '" không có dòng dữ liệu nào.'); return out; }
  const heads = Object.keys(data[0]);
  const dCol = heads.find((h) => /^(date|ngay|thang|ky|period|month)$/.test(noDia(h))) || heads.find((h) => /date|ngay|period/.test(noDia(h)));
  const vCol = heads.find((h) => /^(version|phien ban|scenario|kich ban)$/.test(noDia(h))) || heads.find((h) => /version|scenario/.test(noDia(h)));
  if (!dCol) out.errors.push('Thiếu cột "Date" (ngày đầu kỳ).');
  if (!vCol) out.errors.push('Thiếu cột "Version" (Budget / Target / Forecast…).');
  if (out.errors.length) return out;
  const others = heads.filter((h) => h !== dCol && h !== vCol);
  // phân loại cột: số (chỉ số) hay chữ (chiều)
  const isNum = (h) => { const vals = data.map((r) => r[h]).filter((v) => v !== null && v !== ''); return vals.length > 0 && vals.filter((v) => num(v) !== null).length / vals.length > 0.9; };
  const metrics = others.filter(isNum), dims = others.filter((h) => !isNum(h) && data.some((r) => r[h] !== null && r[h] !== ''));
  if (!metrics.length) { out.errors.push('Chưa có cột số nào (giá trị kế hoạch của các chỉ số) — hãy điền số vào file mẫu.'); return out; }
  const rows = [];
  for (const r of data) {
    const d = toIso(r[dCol]); const vtxt = String(r[vCol] ?? '').trim(); if (!d || !vtxt) continue;
    const vals = metrics.map((m) => num(r[m]));
    if (vals.every((x) => x === null)) continue;   // dòng chưa điền số
    const v = versionOf(vtxt); rows.push({ d, v: v ? v.name : vtxt, known: !!v, vals, dims: dims.map((h) => String(r[h] ?? '').trim()) });
  }
  if (!rows.length) { out.errors.push('Không có dòng nào có đủ Date + Version + số liệu — file mẫu có thể chưa được điền.'); return out; }
  for (const r of rows) out.versions[r.v] = (out.versions[r.v] || 0) + 1;
  const unknown = [...new Set(rows.filter((r) => !r.known).map((r) => r.v))];
  if (unknown.length) out.warnings.push('Tên Version lạ (vẫn được nạp nhưng không ghép với lựa chọn của bạn): ' + unknown.join(', '));
  const present = new Set(rows.filter((r) => r.known).map((r) => versionOf(r.v).k));
  out.stillMissing = (selected || []).filter((k) => !present.has(k));
  if (out.stillMissing.length) out.warnings.push('File chưa có dữ liệu cho: ' + out.stillMissing.map((k) => byKey(k).name).join(', '));
  const ds = rows.map((r) => r.d).sort(); out.dateMin = ds[0]; out.dateMax = ds[ds.length - 1];
  out.rows = rows.length; out.metrics = metrics; out.dims = dims;
  const header = ['Date', 'Version', ...dims, ...metrics];
  out.columns = [{ name: 'Date', type: 'date' }, { name: 'Version', type: 'text' }, ...dims.map((n) => ({ name: n, type: 'text' })), ...metrics.map((n) => ({ name: n, type: 'decimal' }))];
  out.csv = [header.map(csvCell).join(','), ...rows.map((r) => [r.d, r.v, ...r.dims, ...r.vals.map((x) => (x === null ? '' : x))].map(csvCell).join(','))].join('\n') + '\n';
  out.ok = true; return out;
}

// ---------------------------------------------------------------- sinh measure Version (xác định)
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const col = (t, c) => `${q(t)}[${String(c).replace(/\]/g, ']]')}]`;
const strip = (s) => noDia(String(s).replace(/\s*\([^)]*\)\s*$/, ''));
function bestActual(measures, label) {
  const L = strip(label); let best = null, bs = 0;
  for (const m of measures) {
    if (m.kind !== 'base' && m.kind !== 'performance') continue;
    const n = strip(m.name); let s = 0;
    if (n === L) s = 100; else if (n.includes(L) || L.includes(n)) s = 60; else { const a = n.split(' '), b = L.split(' '); s = b.filter((t) => t.length > 2 && a.includes(t)).length * 20; }
    if (m.kind === 'base' && /\(sum\)$/i.test(m.name)) s += 5;
    if (s > bs) { bs = s; best = m; }
  }
  return bs >= 20 ? best : null;
}

/** existing: measures hiện có (đã bỏ measure kind 'version'); meta: thông tin bảng Versions đã nạp; found: cột Version có sẵn trong dữ liệu gốc */
function genMeasures(existing, meta, found) {
  const out = []; const used = new Set(existing.map((m) => m.name.toLowerCase()));
  const uniq = (n) => { let x = n, i = 2; while (used.has(x.toLowerCase())) x = `${n} ${i++}`; used.add(x.toLowerCase()); return x; };
  const add = (m) => { out.push({ ...m, folder: 'Version', kind: 'version' }); return m; };
  const homeFor = (a) => (a ? a.table : (meta ? 'Versions' : null));
  if (meta) {
    const vers = Object.keys(meta.versions);
    for (const M of meta.metrics) {
      const act = bestActual(existing, M);
      for (const V of vers) {
        const verName = uniq(`${M} ${V}`), table = homeFor(act); if (!table) continue;
        const fmt = (act && act.format) || '#,##0';
        add({ id: `ver:${M}:${V}`, name: verName, table, expression: `CALCULATE(SUM(${col('Versions', M)}), ${col('Versions', 'Version')} = "${V.replace(/"/g, '""')}")`, format: fmt, version: V, metric: M });
        if (act) {
          const dn = uniq(`${M} vs ${V}`), pn = uniq(`${M} vs ${V} %`);
          add({ id: `ver:${M}:${V}:d`, name: dn, table, expression: `[${act.name}] - [${verName}]`, format: fmt, version: V, metric: M });
          add({ id: `ver:${M}:${V}:p`, name: pn, table, expression: `DIVIDE([${act.name}] - [${verName}], [${verName}])`, format: '0.0%;-0.0%;0.0%', version: V, metric: M });
        }
      }
    }
  }
  for (const [k, hits] of Object.entries(found || {})) {
    const v = byKey(k); if (!v) continue;
    for (const h of hits) {
      const label = String(h.column).replace(new RegExp(v.re.source, 'ig'), '').trim() || h.column;
      const act = bestActual(existing, label);
      const verName = uniq(`${h.column} (Total)`);
      add({ id: `ver:col:${h.table}:${h.column}`, name: verName, table: h.table, expression: `SUM(${col(h.table, h.column)})`, format: (act && act.format) || '#,##0', version: v.name, metric: label });
      if (act) {
        const dn = uniq(`${act.name} vs ${v.name}`), pn = uniq(`${act.name} vs ${v.name} %`);
        add({ id: `ver:col:${h.column}:d`, name: dn, table: act.table, expression: `[${act.name}] - [${verName}]`, format: act.format || '#,##0', version: v.name, metric: label });
        add({ id: `ver:col:${h.column}:p`, name: pn, table: act.table, expression: `DIVIDE([${act.name}] - [${verName}], [${verName}])`, format: '0.0%;-0.0%;0.0%', version: v.name, metric: label });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- áp vào thư mục run (idempotent)
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
/** runDir: thư mục run; trả { measures: n, table: bool } */
function applyToRun(runDir, { useUpload, found }) {
  const inV = path.join(runDir, '00-input', 'version'), s2 = path.join(runDir, '02-key-metrics'), s3 = path.join(runDir, '03-data-etl');
  const meta = useUpload ? rj(path.join(inV, 'versions.json')) : null;
  let table = false;
  if (meta && fs.existsSync(path.join(inV, 'Versions.csv'))) {
    fs.mkdirSync(path.join(s3, 'clean'), { recursive: true });
    fs.copyFileSync(path.join(inV, 'Versions.csv'), path.join(s3, 'clean', 'Versions.csv'));
    const ms = rj(path.join(s3, 'model-spec.json'));
    if (ms && Array.isArray(ms.tables)) {
      ms.tables = ms.tables.filter((t) => t.name !== 'Versions');
      ms.tables.push({ name: 'Versions', file: 'Versions.csv', role: 'fact', versionTable: true, rows: meta.rows, columns: meta.columns.map((c) => ({ name: c.name, type: c.type, summarizeBy: c.type === 'decimal' ? 'sum' : 'none', hidden: false, format: null, description: c.name === 'Version' ? 'Tên version (Budget/Target/Forecast…)' : '' })) });
      fs.writeFileSync(path.join(s3, 'model-spec.json'), JSON.stringify(ms, null, 2), 'utf8'); table = true;
    }
  }
  const mp = path.join(s2, 'measures.json'), mj = rj(mp);
  if (!mj || !Array.isArray(mj.measures)) return { measures: 0, table };
  const base = mj.measures.filter((m) => m.kind !== 'version');
  const gen = genMeasures(base, meta, found);
  mj.measures = [...base, ...gen]; mj.versionMeasures = gen.length;
  fs.writeFileSync(mp, JSON.stringify(mj, null, 2), 'utf8');
  const dp = path.join(s2, 'measures.dax');
  if (fs.existsSync(dp)) {
    let dax = fs.readFileSync(dp, 'utf8'); const i = dax.indexOf('\n// ===== Version =====');
    if (i >= 0) dax = dax.slice(0, i).replace(/\s+$/, '') + '\n';
    if (gen.length) dax += '\n// ===== Version =====\n' + gen.map((m) => `${m.name} = ${m.expression}`).join('\n') + '\n';
    fs.writeFileSync(dp, dax, 'utf8');
  }
  return { measures: gen.length, table };
}

module.exports = { VERSIONS, byKey, versionOf, detect, sampleBuffer, parseWorkbook, genMeasures, applyToRun, noDia };
