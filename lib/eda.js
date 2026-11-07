'use strict';
/**
 * EDA tất định (không dùng model) trên dữ liệu ĐÃ LÀM SẠCH → danh sách "phát hiện" có mã F1, F2...
 * Mục đích: chặng 1/2 dựa vào bằng chứng thật (phân phối, ngoại lệ, xu hướng, tập trung, tương quan, chất lượng)
 * thay vì suy đoán. Mỗi finding có: id, kind, table, text (tiếng Việt, có số liệu), evidence.
 *
 * API: analyze(cleanDir, checks) → { findings, tables, notes }; toMarkdown(result); run(cleanDir, checksPath, outDir)
 */
const fs = require('fs');
const path = require('path');

// ---------- tiện ích ----------
function parseCsv(txt) {
  txt = txt.replace(/^﻿/, ''); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
function quantile(sorted, p) { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function fmt(n) { if (n === null || n === undefined || !Number.isFinite(n)) return '—'; const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(2) + ' tỷ'; if (a >= 1e6) return (n / 1e6).toFixed(2) + ' triệu'; if (a >= 1e4) return Math.round(n).toLocaleString('en-US'); return String(Math.round(n * 100) / 100); }
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const ID_NAME = /(^|[\s_\-])(id|mã|ma|code|key|stt|no|số hiệu|postal|zip|row)([\s_\-]|$)|\bid$/i;
const MEASURE_NAME = /sales|revenue|doanh thu|doanh số|amount|profit|lợi nhuận|loi nhuan|total|tổng|giá trị|thành tiền|tiền|chi phí|cost|units|quantity|số lượng|qty|price|giá|salary|lương/i;

function pearson(x, y) {
  const n = x.length; if (n < 8) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// ---------- phân tích một bảng ----------
function analyzeTable(name, rows, colMeta, add) {
  const head = rows[0], body = rows.slice(1);
  const n = body.length; if (!n) return { name, rows: 0 };
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  const meta = Object.fromEntries((colMeta || []).map((c) => [c.name, c]));
  const colVals = (h) => body.map((r) => r[idx[h]]);
  const info = { name, rows: n, columns: head.length, numeric: [], dates: [], categorical: [], ids: [] };

  // phân loại cột
  for (const h of head) {
    const t = (meta[h] && meta[h].type) || 'text';
    const vals = colVals(h).filter((v) => v !== '');
    const distinct = new Set(vals).size;
    const idLike = ID_NAME.test(h) || (distinct === n && n > 20 && t !== 'decimal');
    if (t === 'date' || t === 'datetime') info.dates.push(h);
    else if ((t === 'int' || t === 'decimal') && !idLike) info.numeric.push(h);
    else if (idLike) info.ids.push(h);
    else if (distinct >= 2 && distinct <= 30 && distinct < n * 0.5) info.categorical.push(h);
  }

  // chất lượng
  head.forEach((h) => {
    const vals = colVals(h); const nulls = vals.filter((v) => v === '').length, d = new Set(vals.filter((v) => v !== '')).size;
    if (nulls / n >= 0.05) add({ kind: 'quality', table: name, column: h, severity: nulls / n >= 0.3 ? 'high' : 'medium', text: `Cột "${h}" (bảng ${name}) thiếu ${pct(nulls / n)} giá trị (${nulls}/${n} dòng) — số liệu theo cột này có thể lệch.`, evidence: { nulls, rows: n } });
    if (d === 1 && n > 5) add({ kind: 'quality', table: name, column: h, severity: 'low', text: `Cột "${h}" (bảng ${name}) chỉ có một giá trị duy nhất — không có ích cho phân tích.`, evidence: { value: vals.find((v) => v !== '') } });
  });
  if (info.ids.length) {
    const k = info.ids[0], vs = colVals(k).filter((v) => v !== ''); const dup = vs.length - new Set(vs).size;
    if (dup > 0 && /order|đơn|row|id$/i.test(k) === false) { /* khóa không bắt buộc duy nhất ở fact */ }
  }

  // độ đo chính
  const stats = {};
  for (const h of info.numeric) {
    const v = colVals(h).map(num).filter((x) => x !== null).sort((a, b) => a - b);
    if (v.length < 5) continue;
    const q1 = quantile(v, 0.25), q3 = quantile(v, 0.75), med = quantile(v, 0.5), iqr = q3 - q1, m = mean(v);
    const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr, xlo = q1 - 3 * iqr, xhi = q3 + 3 * iqr;
    const out = iqr > 0 ? v.filter((x) => x < lo || x > hi).length : 0, ext = iqr > 0 ? v.filter((x) => x < xlo || x > xhi).length : 0;
    stats[h] = { n: v.length, min: v[0], max: v[v.length - 1], mean: m, median: med, q1, q3, p95: quantile(v, 0.95), sum: sum(v), outliers: out, extreme: ext, negatives: v.filter((x) => x < 0).length, zeros: v.filter((x) => x === 0).length };
    const s = stats[h];
    const farOff = ext > 0 && med > 0 && (s.max >= 10 * med || (s.min < 0 && s.min <= -10 * med));
    if (ext > 0 && (ext / v.length >= 0.005 || farOff)) add({ kind: 'outlier', table: name, column: h, severity: 'medium', text: `"${h}" có ${ext} giá trị cực đoan (${pct(ext / v.length)}); max = ${fmt(s.max)} gấp ${med ? (s.max / med).toFixed(1) : '—'} lần median (${fmt(med)}) — kiểm tra trước khi dùng trung bình.`, evidence: { extreme: ext, max: s.max, median: med } });
    else if (out / v.length >= 0.05) add({ kind: 'outlier', table: name, column: h, severity: 'low', text: `"${h}" có ${out} ngoại lệ theo IQR (${pct(out / v.length)}).`, evidence: { outliers: out } });
    if (med > 0 && m / med >= 1.5) add({ kind: 'distribution', table: name, column: h, severity: 'low', text: `"${h}" lệch phải mạnh: trung bình ${fmt(m)} so với median ${fmt(med)} — nên báo cáo median hoặc phân nhóm thay vì chỉ trung bình.`, evidence: { mean: m, median: med } });
    if (s.negatives > 0) add({ kind: 'distribution', table: name, column: h, severity: 'low', text: `"${h}" có ${s.negatives} giá trị âm (${pct(s.negatives / v.length)}) — có thể là hoàn/hủy hoặc lỗ; cần định nghĩa rõ khi tính KPI.`, evidence: { negatives: s.negatives } });
  }
  const measures = Object.keys(stats);
  measures.sort((a, b) => (MEASURE_NAME.test(b) ? 1 : 0) - (MEASURE_NAME.test(a) ? 1 : 0) || stats[b].sum - stats[a].sum);
  info.stats = stats; info.mainMeasures = measures.slice(0, 3);

  // xu hướng thời gian
  const dcol = info.dates.sort((a, b) => (/date|ngày|ngay|time/i.test(b) ? 1 : 0) - (/date|ngày|ngay|time/i.test(a) ? 1 : 0))[0];
  if (dcol) {
    const dvals = colVals(dcol).filter((v) => v !== '').map((v) => v.slice(0, 10)).sort();
    info.dateRange = { column: dcol, min: dvals[0], max: dvals[dvals.length - 1] };
    const months = new Map(); // yyyy-mm → {measure: sum, rows}
    for (const r of body) {
      const d = r[idx[dcol]]; if (!d) continue; const key = d.slice(0, 7); let o = months.get(key); if (!o) { o = { rows: 0 }; months.set(key, o); }
      o.rows++; for (const mname of info.mainMeasures) { const x = num(r[idx[mname]]); if (x !== null) o[mname] = (o[mname] || 0) + x; }
    }
    const keys = [...months.keys()].sort();
    info.months = keys.length;
    add({ kind: 'time', table: name, column: dcol, severity: 'info', text: `Dữ liệu bảng ${name} trải từ ${info.dateRange.min} đến ${info.dateRange.max} (${keys.length} tháng có dữ liệu, ${n} dòng).`, evidence: info.dateRange });
    // tháng thiếu
    if (keys.length >= 2) {
      const [y0, m0] = keys[0].split('-').map(Number), [y1, m1] = keys[keys.length - 1].split('-').map(Number);
      const expect = (y1 - y0) * 12 + (m1 - m0) + 1; if (expect > keys.length) add({ kind: 'quality', table: name, column: dcol, severity: 'medium', text: `Chuỗi thời gian thiếu ${expect - keys.length} tháng trong khoảng ${keys[0]} → ${keys[keys.length - 1]} — so sánh MoM/YoY có thể sai ở các tháng đó.`, evidence: { expected: expect, present: keys.length } });
    }
    if (keys.length >= 3) for (const mname of info.mainMeasures.slice(0, 2)) {
      const series = keys.map((k) => months.get(k)[mname] || 0); const L = series.length;
      const last = series[L - 1], prev = series[L - 2];
      const half = Math.floor(L / 2), a = mean(series.slice(0, half)), b = mean(series.slice(L - half));
      if (a > 0) add({ kind: 'trend', table: name, column: mname, severity: 'info', text: `"${mname}" theo tháng: nửa sau trung bình ${fmt(b)} so với nửa đầu ${fmt(a)} (${b >= a ? '+' : ''}${pct((b - a) / a)}).`, evidence: { firstHalf: a, secondHalf: b } });
      if (prev > 0) add({ kind: 'trend', table: name, column: mname, severity: Math.abs((last - prev) / prev) >= 0.2 ? 'medium' : 'info', text: `"${mname}" tháng gần nhất (${keys[L - 1]}) = ${fmt(last)}, ${last >= prev ? 'tăng' : 'giảm'} ${pct(Math.abs((last - prev) / prev))} so với tháng trước (${fmt(prev)}). Lưu ý tháng cuối có thể chưa đủ ngày.`, evidence: { last, prev, month: keys[L - 1] } });
      if (L >= 13) { const ly = series[L - 13]; if (ly > 0) add({ kind: 'trend', table: name, column: mname, severity: 'info', text: `"${mname}" tháng ${keys[L - 1]} so với cùng kỳ năm trước: ${last >= ly ? '+' : '-'}${pct(Math.abs((last - ly) / ly))} (YoY).`, evidence: { last, lastYear: ly } }); }
      let bi = 0, wi = 0; series.forEach((x, i) => { if (x > series[bi]) bi = i; if (x < series[wi]) wi = i; });
      add({ kind: 'trend', table: name, column: mname, severity: 'info', text: `"${mname}": tháng cao nhất ${keys[bi]} (${fmt(series[bi])}), thấp nhất ${keys[wi]} (${fmt(series[wi])}).`, evidence: { best: keys[bi], worst: keys[wi] } });
      if (L >= 24) { // tính mùa vụ: tháng-trong-năm
        const byM = Array(12).fill(0), cnt = Array(12).fill(0); keys.forEach((k, i) => { const mm = +k.slice(5, 7) - 1; byM[mm] += series[i]; cnt[mm]++; });
        const avg = byM.map((x, i) => (cnt[i] ? x / cnt[i] : 0)), top = avg.indexOf(Math.max(...avg)), tot = mean(avg.filter((x) => x > 0));
        if (tot > 0 && avg[top] / tot >= 1.3) add({ kind: 'seasonality', table: name, column: mname, severity: 'info', text: `"${mname}" có mùa vụ: tháng ${top + 1} cao hơn trung bình ${pct(avg[top] / tot - 1, 0)}.`, evidence: { month: top + 1 } });
      }
    }
  }

  // cơ cấu theo nhóm (chiều)
  const mm = info.mainMeasures[0];
  if (mm) for (const cat of info.categorical.slice(0, 4)) {
    const groups = new Map();
    for (const r of body) { const g = r[idx[cat]]; const x = num(r[idx[mm]]); if (g === '' || x === null) continue; groups.set(g, (groups.get(g) || 0) + x); }
    const arr = [...groups.entries()].sort((a, b) => b[1] - a[1]); const tot = sum(arr.map((e) => e[1]));
    if (arr.length < 2 || tot <= 0) continue;
    const top1 = arr[0][1] / tot, top3 = sum(arr.slice(0, 3).map((e) => e[1])) / tot, hhi = sum(arr.map((e) => (e[1] / tot) ** 2));
    const lowest = arr[arr.length - 1];
    add({ kind: 'segment', table: name, column: cat, severity: top1 >= 0.5 ? 'medium' : 'info', text: `"${mm}" theo "${cat}": ${arr[0][0]} chiếm ${pct(top1)}${arr.length > 2 ? `, top 3 chiếm ${pct(top3)}` : ''}; thấp nhất là ${lowest[0]} (${pct(lowest[1] / tot)}). ${arr.length} nhóm.`, evidence: { top: arr.slice(0, 5).map(([k, v]) => ({ group: k, value: v, share: v / tot })), hhi } });
    if (top1 >= 0.5) add({ kind: 'concentration', table: name, column: cat, severity: 'medium', text: `Tập trung rủi ro: "${arr[0][0]}" (${cat}) đóng góp hơn một nửa ${mm} (${pct(top1)}).`, evidence: { group: arr[0][0], share: top1 } });
    else if (arr.length >= 5 && top3 >= 0.8) add({ kind: 'concentration', table: name, column: cat, severity: 'low', text: `3 nhóm đầu của "${cat}" tạo ${pct(top3)} ${mm} (quy luật đuôi dài: ${arr.length - 3} nhóm còn lại chỉ ${pct(1 - top3)}).`, evidence: { top3 } });
    // so sánh hiệu quả giữa các nhóm cho tỷ lệ lợi nhuận nếu có
  }
  // tương quan
  let corrCount = 0;
  const nums = info.mainMeasures.concat(info.numeric.filter((h) => !info.mainMeasures.includes(h))).slice(0, 8);
  for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
    const xs = [], ys = []; for (const r of body) { const a = num(r[idx[nums[i]]]), b = num(r[idx[nums[j]]]); if (a !== null && b !== null) { xs.push(a); ys.push(b); } }
    const r = pearson(xs, ys);
    if (r !== null && Math.abs(r) >= 0.7 && corrCount < 4) { corrCount++; add({ kind: 'correlation', table: name, column: nums[i] + ' ~ ' + nums[j], severity: 'info', text: `"${nums[i]}" và "${nums[j]}" tương quan ${r > 0 ? 'thuận' : 'nghịch'} mạnh (r = ${r.toFixed(2)}) — ${Math.abs(r) >= 0.95 ? 'gần tuyến tính; có thể là quan hệ định nghĩa (vd. Doanh thu = Chi phí + Lợi nhuận) nên không coi là phát hiện nhân quả' : 'có thể dùng để giải thích biến động (tương quan ≠ nhân quả)'}.`, evidence: { r } }); }
  }
  return info;
}

// ---------- API ----------
function analyze(cleanDir, checks) {
  const findings = []; const tables = []; const notes = [];
  const add = (f) => { f.id = 'F' + (findings.length + 1); findings.push(f); };
  const list = (checks && checks.tables) || [];
  const files = list.length ? list.map((t) => ({ name: t.name, file: path.join(cleanDir, path.basename(t.file)), cols: t.columns })) : fs.readdirSync(cleanDir).filter((f) => /\.csv$/i.test(f)).map((f) => ({ name: f.replace(/\.csv$/i, ''), file: path.join(cleanDir, f), cols: [] }));
  for (const t of files) {
    if (!fs.existsSync(t.file)) { notes.push('Thiếu file ' + t.file); continue; }
    const rows = parseCsv(fs.readFileSync(t.file, 'utf8')).filter((r) => r.length > 1 || (r[0] !== '' && r[0] !== undefined));
    tables.push(analyzeTable(t.name, rows, t.cols, add));
  }
  // sắp xếp: mức độ quan trọng giảm dần nhưng giữ mã theo thứ tự cuối cùng
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id, undefined, { numeric: true }));
  findings.forEach((f, i) => (f.id = 'F' + (i + 1)));
  return { generatedAt: new Date().toISOString(), tables: tables.map(({ stats, ...r }) => ({ ...r, stats })), findings, notes };
}

function toMarkdown(res, maxFindings = 40) {
  const L = ['# PHÁT HIỆN TỪ DỮ LIỆU (EDA tự động, tất định — không do model sinh)', '',
    'Mỗi phát hiện có mã **F#**. Khi nêu vấn đề/mục tiêu/giả thuyết/KPI, hãy **trích mã F# làm bằng chứng**; không nêu con số không có ở đây hoặc trong bảng dữ liệu.', ''];
  for (const t of res.tables) {
    L.push(`## Bảng "${t.name}" — ${t.rows} dòng, ${t.columns} cột`);
    if (t.dateRange) L.push(`- Thời gian: ${t.dateRange.column} từ ${t.dateRange.min} đến ${t.dateRange.max}`);
    if (t.mainMeasures && t.mainMeasures.length) {
      L.push('', '| Độ đo | Tổng | Trung bình | Median | Min | Max | Ngoại lệ |', '|---|---|---|---|---|---|---|');
      for (const m of t.mainMeasures) { const s = t.stats[m]; L.push(`| ${m} | ${fmt(s.sum)} | ${fmt(s.mean)} | ${fmt(s.median)} | ${fmt(s.min)} | ${fmt(s.max)} | ${s.outliers} |`); }
    }
    if (t.categorical && t.categorical.length) L.push('', `- Cột phân loại dùng làm chiều: ${t.categorical.join(', ')}`);
    L.push('');
  }
  L.push('## Danh sách phát hiện');
  const shown = res.findings.slice(0, maxFindings);
  shown.forEach((f) => L.push(`- **${f.id}** [${f.kind}${f.severity && f.severity !== 'info' ? ', ' + f.severity : ''}] ${f.text}`));
  if (res.findings.length > shown.length) L.push(`- …và ${res.findings.length - shown.length} phát hiện mức thấp khác (có trong eda.json).`);
  if (!res.findings.length) L.push('- (Dữ liệu quá nhỏ hoặc không đủ cột số/ngày để phát hiện điều gì.)');
  if (res.notes.length) L.push('', ...res.notes.map((n) => '- ⚠ ' + n));
  return L.join('\n');
}

/** Chạy EDA trên thư mục clean + data-checks.json, ghi eda.json / eda.md vào outDir */
function run(cleanDir, checksPath, outDir) {
  const checks = fs.existsSync(checksPath) ? JSON.parse(fs.readFileSync(checksPath, 'utf8')) : null;
  const res = analyze(cleanDir, checks);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'eda.json'), JSON.stringify(res, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'eda.md'), toMarkdown(res), 'utf8');
  return res;
}

module.exports = { parseCsv, analyze, toMarkdown, run };
