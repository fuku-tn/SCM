'use strict';
/**
 * Đề xuất BỐ CỤC dashboard trước khi chạy chặng 4 (người dùng review, góp ý, duyệt).
 *
 * Plan = các trang (mỗi trang bám 1 trang của template; trang cùng nguồn sau lần đầu là BẢN NHÂN BẢN) × các ô biểu đồ (slot).
 * Template quyết định số ô/vị trí/loại biểu đồ của mỗi trang → plan chỉ chọn nội dung (chỉ số × chiều) cho từng ô,
 * được phép đổi loại biểu đồ trong cùng họ (cột↔thanh↔đường↔vùng; tròn↔donut) và đặt Top N.
 *
 * Phần xác định (lib này) lo: chuẩn hóa/kiểm tra (slot hợp lệ, KPI 4–6, giới hạn số giá trị hiển thị, độ phủ chỉ số/chiều),
 * kế hoạch dự phòng (heuristic) và chuyển plan → khung dashboard-spec cho chặng 4. AI chỉ đề xuất nội dung/câu chuyện.
 */
const { noDia } = require('./samples.js');

const KPI = new Set(['card', 'cardVisual', 'kpi']);
const FILTER = new Set(['slicer', 'textSlicer', 'advancedSlicerVisual', 'listSlicer']);
const TREND = new Set(['lineChart', 'areaChart', 'lineClusteredColumnComboChart', 'lineStackedColumnComboChart', 'ribbonChart']);
const COMPARE = new Set(['clusteredBarChart', 'clusteredColumnChart', 'stackedBarChart', 'stackedColumnChart', 'hundredPercentStackedBarChart', 'hundredPercentStackedColumnChart']);
const SHARE = new Set(['pieChart', 'donutChart', 'treemap', 'funnel']);
const DETAIL = new Set(['tableEx', 'pivotTable']);
const roleOf = (t) => (KPI.has(t) ? 'kpi' : FILTER.has(t) ? 'filter' : TREND.has(t) ? 'trend' : COMPARE.has(t) ? 'compare' : SHARE.has(t) ? 'share' : DETAIL.has(t) ? 'detail' : 'other');
const FAMILIES = [
  ['clusteredColumnChart', 'clusteredBarChart', 'stackedColumnChart', 'stackedBarChart', 'lineChart', 'areaChart'],
  ['pieChart', 'donutChart'],
];
const typeOptions = (t) => (FAMILIES.find((f) => f.includes(t)) || [t]).slice();
const TYPE_LABEL = { clusteredColumnChart: 'Column', clusteredBarChart: 'Bar', stackedColumnChart: 'Stacked column', stackedBarChart: 'Stacked bar', lineChart: 'Line', areaChart: 'Area', pieChart: 'Pie', donutChart: 'Donut' };

// Số giá trị tối đa nên hiện trên 1 biểu đồ (vượt → Top N hoặc đổi chiều)
const LIMIT = { clusteredColumnChart: 12, clusteredBarChart: 15, stackedColumnChart: 8, stackedBarChart: 10, lineChart: 8, areaChart: 6, pieChart: 5, donutChart: 5, treemap: 20, funnel: 8 };
const TOPN_DEFAULT = (type) => (type === 'clusteredColumnChart' ? 10 : type === 'treemap' ? 15 : 10);
const KPI_MIN = 4, KPI_MAX = 6;

const timeLabel = (s) => /(^|\s)(date|time|month|year|quarter|day|week|period)|ngay|thang|nam\b|quy\b|thoi gian/.test(noDia(s));

// ---------------------------------------------------------------- dữ liệu / cột
function columnsOf(profile, sheets) {
  const out = [];
  for (const s of (profile && profile.sheets) || []) {
    if (sheets && sheets.length && !sheets.includes(s.name)) continue;
    for (const c of s.columns || []) out.push({ table: s.name, column: c.name, type: c.type, distinct: c.distinct, min: c.min, max: c.max, rows: s.rowCount });
  }
  return out;
}
function monthsBetween(min, max) {
  if (!min || !max) return null;
  const a = new Date(min), b = new Date(max); if (isNaN(a) || isNaN(b)) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1;
}
/** nhãn chiều → cột thật (hoặc cột Calendar) ; trả {table,column,distinct,type} | null */
function resolveDim(label, cols, hint) {
  if (hint && hint.table && hint.column) { const c = cols.find((x) => x.table === hint.table && x.column === hint.column); if (c) return c; if (/^calendar$/i.test(hint.table)) return calendarCol(hint.column, cols); }
  const n = noDia(label); if (!n) return null;
  const date = cols.find((c) => c.type === 'date');
  if (timeLabel(label) && date) return calendarCol(/year|nam\b/.test(n) && !/month|thang/.test(n) ? 'Year' : /quarter|quy/.test(n) ? 'YearQuarter' : 'YearMonth', cols);
  const score = (c) => {
    const cn = noDia(c.column); if (!cn) return 0;
    if (cn === n) return 100; if (n.includes(cn) || cn.includes(n)) return 60 + Math.min(cn.length, n.length);
    const tk = n.split(' ').filter((t) => t.length > 2), ck = cn.split(' ');
    return tk.filter((t) => ck.includes(t)).length * 20;
  };
  const best = cols.filter((c) => c.type !== 'number').map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s >= 20 ? best.c : null;
}
function calendarCol(column, cols) {
  const d = cols.find((c) => c.type === 'date');
  const months = d ? monthsBetween(d.min, d.max) : null;
  const years = d && d.min && d.max ? new Date(d.max).getUTCFullYear() - new Date(d.min).getUTCFullYear() + 1 : null;
  return { table: 'Calendar', column, type: 'text', distinct: column === 'Year' ? years : column === 'YearQuarter' ? (months ? Math.ceil(months / 3) : null) : months };
}

// ---------------------------------------------------------------- template → ô (slot)
function pagesOf(tpl) {
  return tpl.manifest.pages.filter((p) => !p.tooltip).map((p) => {
    const slots = p.visuals.filter((v) => v.kind === 'data' && !v.hiddenVisual).map((v) => ({ key: v.key, type: v.type, role: roleOf(v.type), x: v.x, y: v.y, w: v.w, h: v.h, roles: v.roles }));
    return { no: p.no, name: p.name, width: p.width, height: p.height, slots };
  });
}
const dataPages = (tpl) => pagesOf(tpl).filter((p) => p.slots.some((s) => s.role !== 'other'));
const slotSummaryMd = (tpl) => dataPages(tpl).map((p) => `### Trang template ${p.no} "${p.name}" (${p.width}×${p.height}) — ${p.slots.length} ô\n| key | loại | nhóm | vị trí x,y (rộng×cao) |\n|---|---|---|---|\n` + p.slots.map((s) => `| ${s.key} | ${s.type} | ${s.role} | ${s.x},${s.y} (${s.w}×${s.h}) |`).join('\n')).join('\n\n');

// ---------------------------------------------------------------- chọn loại biểu đồ phù hợp dữ liệu + đa dạng hóa giữa các trang
const RATE_RE = /(rate|ratio|percent|%|avg|average|margin|price|per |ty le|ti le|trung binh|bien|gia\b)/;
/** các loại biểu đồ (trong họ của ô) xếp từ PHÙ HỢP nhất → ít phù hợp, theo vai trò, số giá trị hiển thị và bản chất chỉ số */
function rankTypes(v) {
  const opts = v.typeOptions || []; if (!opts.length) return [];
  const shown = v.topN || v.distinct || 0, rate = RATE_RE.test(noDia(v.measure || ''));
  let pref = [];
  if (v.role === 'trend') {
    pref = rate ? ['lineChart', 'areaChart', 'clusteredColumnChart', 'stackedColumnChart'] : ['areaChart', 'lineChart', 'clusteredColumnChart', 'stackedColumnChart'];
    if (shown > 18) pref = pref.filter((t) => !/ColumnChart$/.test(t));   // quá nhiều kỳ → cột bị rối
  } else if (v.role === 'compare') {
    pref = shown > 8 ? ['clusteredBarChart', 'stackedBarChart', 'clusteredColumnChart', 'stackedColumnChart'] : ['clusteredColumnChart', 'clusteredBarChart', 'stackedColumnChart', 'stackedBarChart'];
    pref = pref.filter((t) => !LIMIT[t] || !shown || shown <= LIMIT[t]);
  } else if (v.role === 'share') pref = ['donutChart', 'pieChart'];
  const r = pref.filter((t) => opts.includes(t));
  return r.length ? r : [v.slotType || opts[0]];
}
const sigOf = (p) => p.visuals.filter((v) => !v.remove && v.slot).map((v) => v.slot + ':' + v.type).join('|');
/** trang dùng chung trang template nguồn thì không được "y hệt nhau": xoay loại biểu đồ trong họ cho phép theo mức phù hợp */
function diversify(pages, W) {
  const seen = new Map();
  for (const p of pages) {
    const e = seen.get(p.from) || { sigs: new Set(), n: 0 }; seen.set(p.from, e);
    if (e.n > 0 && e.sigs.has(sigOf(p))) {
      const vs = p.visuals.filter((v) => !v.remove && v.slot && (v.role === 'compare' || v.role === 'trend' || v.role === 'share'));
      const base = vs.map((v) => v.type); const changed = [];
      // duyệt các tổ hợp loại biểu đồ (ưu tiên tổ hợp ít lệch khỏi mức phù hợp nhất) → lấy tổ hợp đầu tiên chưa trang nào dùng
      const ranks = vs.map((v) => rankTypes(v)); let combos = [[]];
      ranks.forEach((r) => { const nx = []; for (const c of combos) for (let k = 0; k < Math.min(r.length, 4); k++) nx.push([...c, k]); combos = nx.slice(0, 400); });
      combos.sort((x, y) => x.reduce((a2, b2) => a2 + b2, 0) - y.reduce((a2, b2) => a2 + b2, 0));
      for (const c of combos) { vs.forEach((v, i) => { v.type = ranks[i][c[i]]; }); if (!e.sigs.has(sigOf(p))) break; }
      if (e.sigs.has(sigOf(p))) vs.forEach((v, i) => { v.type = base[i]; });
      vs.forEach((v, i) => { if (v.type !== base[i]) { changed.push(v); v.guard = v.guard && v.guard.level !== 'info' ? v.guard : { level: 'info', text: `Đa dạng hóa: đổi ${TYPE_LABEL[base[i]] || base[i]} → ${TYPE_LABEL[v.type] || v.type} để trang này không giống trang trước dùng cùng khung template` }; } });
      if (e.sigs.has(sigOf(p))) W.push(`${p.id} "${p.title}": cùng khung template và cùng loại biểu đồ với một trang trước (ô chỉ cho đổi trong họ ${[...new Set(vs.flatMap((v) => v.typeOptions || []))].map((t) => TYPE_LABEL[t] || t).join('/')}) — nên chọn trang template khác hoặc đổi chiều/chỉ số của trang.`);
      else if (changed.length) W.push(`${p.id} "${p.title}": đã đa dạng hóa ${changed.length} biểu đồ (đổi loại cho khác trang trước).`);
    }
    e.sigs.add(sigOf(p)); e.n++;
  }
}

// ---------------------------------------------------------------- chuẩn hóa + kiểm tra
/**
 * ctx: { tpl, form, profile, aud?:{pages:[lo,hi]} , lang }
 * Trả về plan đã chuẩn hóa (ghi thêm geom, typeOptions, guard, unusedSlots) + warnings[].
 */
function normalize(plan, ctx) {
  const { tpl, form } = ctx; const lang = ctx.lang || 'en';
  const cols = columnsOf(ctx.profile, form && form.sheets);
  const tp = dataPages(tpl); if (!tp.length) throw new Error('Template không có trang nào chứa biểu đồ dữ liệu');
  const out = { version: 1, status: plan.status || 'draft', template: { id: tpl.id, name: tpl.name, uploaded: !!tpl.uploaded }, language: lang, storyline: String(plan.storyline || ''), pages: [], warnings: [], notes: [] };
  const seenFrom = new Set(); const W = out.warnings;
  const dimsUser = (form && form.dimensions) || [];
  (plan.pages || []).forEach((pg, pi) => {
    const src = tp.find((p) => String(p.no) === String(pg.from)) || tp.find((p) => noDia(p.name) === noDia(pg.from)) || tp[0];
    const id = 'P' + (pi + 1);
    const slotBy = new Map(src.slots.map((s) => [s.key, s]));
    const used = new Set();
    const vis = [];
    const pending = [];
    for (const [vi, v0] of (pg.visuals || []).entries()) {
      const v = { id: id + 'V' + (vi + 1), slot: null, slotType: '', type: '', role: '', title: String(v0.title || ''), measure: String(v0.measure || ''), dimension: String(v0.dimension || ''), column: null, distinct: null, topN: v0.topN ? Math.max(1, Math.floor(+v0.topN)) : null, note: String(v0.note || ''), reason: String(v0.reason || ''), remove: !!v0.remove, guard: null };
      const want = v0.slot && slotBy.get(String(v0.slot));
      if (want && !used.has(want.key)) { v.slot = want.key; used.add(want.key); } else pending.push({ v, v0 });
      vis.push({ v, v0 });
    }
    // ô chưa hợp lệ/trùng → thử ô trống cùng nhóm (đọc theo thứ tự trên→dưới, trái→phải)
    for (const { v, v0 } of pending) {
      const wantRole = roleOf(v0.type || '') !== 'other' ? roleOf(v0.type) : v0.role;
      const free = src.slots.find((s) => !used.has(s.key) && s.role === wantRole && s.role !== 'other');
      if (free) { v.slot = free.key; used.add(free.key); v.guard = { level: 'info', text: `Ô "${v0.slot || '?'}" không dùng được → chuyển sang ô ${free.key}` }; }
    }
    for (const { v, v0 } of vis) {
      const s = v.slot && slotBy.get(v.slot);
      if (!s) { v.remove = true; v.guard = { level: 'warn', text: 'Không có ô phù hợp trong trang template → không đưa vào dashboard' }; v.slotType = ''; v.type = String(v0.type || ''); v.role = roleOf(v.type); v.typeOptions = []; v.geom = null; continue; }
      v.slotType = s.type; v.role = s.role; v.geom = { x: s.x, y: s.y, w: s.w, h: s.h };
      v.typeOptions = typeOptions(s.type);
      v.type = v0.type && v.typeOptions.includes(v0.type) ? v0.type : s.type;
      if (v0.type && v0.type !== v.type && roleOf(v0.type) !== 'other') v.guard = { level: 'info', text: `Ô này của template là ${TYPE_LABEL[s.type] || s.type}, chỉ đổi được trong họ ${v.typeOptions.map((t) => TYPE_LABEL[t] || t).join('/')} → giữ ${TYPE_LABEL[v.type] || v.type}` };
      // cột + cardinality
      if (s.role !== 'kpi' && s.role !== 'detail') {
        const hint = v0.column && typeof v0.column === 'object' ? v0.column : null;
        let c = resolveDim(v.dimension, cols, hint);
        if (c) { v.column = { table: c.table, column: c.column }; v.distinct = c.distinct ?? null; }
        else if (v.dimension) v.guard = v.guard || { level: 'warn', text: `Chưa khớp chiều "${v.dimension}" với cột nào trong dữ liệu — chặng 4 sẽ chọn cột gần nhất` };
        const lim = LIMIT[v.type];
        if (v.distinct && lim && v.distinct > lim && s.role !== 'filter' && s.role !== 'trend' && !(v.column && /^calendar$/i.test(v.column.table))) {
          if (s.role === 'share') {
            const alt = dimsUser.map((d) => resolveDim(d, cols)).filter((x) => x && x.distinct && x.distinct <= lim && !timeLabel(x.column)).sort((a, b) => a.distinct - b.distinct)[0];
            if (alt) { v.guard = { level: 'fix', text: `${v.dimension} có ${v.distinct} giá trị — quá nhiều cho ${TYPE_LABEL[v.type] || v.type} (≤ ${lim}) → đổi sang chiều "${alt.column}" (${alt.distinct} giá trị)` }; v.dimension = alt.column; v.column = { table: alt.table, column: alt.column }; v.distinct = alt.distinct; v.topN = null; }
            else { v.topN = v.topN || lim; v.guard = { level: 'warn', text: `${v.dimension} có ${v.distinct} giá trị, ${TYPE_LABEL[v.type] || v.type} chỉ nên ≤ ${lim} → đặt Top ${v.topN} (tỷ trọng chỉ tính trên các nhóm hiển thị; nên đổi sang chiều ít giá trị hơn hoặc dùng biểu đồ cột)` }; }
          } else {
            v.topN = v.topN || TOPN_DEFAULT(v.type);
            v.guard = { level: 'fix', text: `${v.dimension || v.column.column} có ${v.distinct} giá trị — quá nhiều cho trục ${TYPE_LABEL[v.type] || v.type} (≤ ${lim}) → chỉ hiện Top ${v.topN}` };
          }
        }
        if (v.topN && v.distinct && v.topN >= v.distinct) v.topN = null;
        if (s.role === 'trend' || s.role === 'filter') { if (s.role === 'trend') v.topN = null; }
      } else v.topN = null;
    }
    // thẻ KPI: 4–6 / trang (luật cứng)
    const kp = vis.map((x) => x.v).filter((v) => v.role === 'kpi' && !v.remove);
    if (kp.length > KPI_MAX) { kp.slice(KPI_MAX).forEach((v) => { v.remove = true; v.guard = { level: 'fix', text: `Quá ${KPI_MAX} thẻ KPI trên một trang → bỏ thẻ này` }; }); W.push(`${id}: có ${kp.length} thẻ KPI, giữ ${KPI_MAX} (quy tắc tối đa ${KPI_MAX}/trang).`); }
    const capKpi = src.slots.filter((s) => s.role === 'kpi').length;
    const kpiNow = Math.min(kp.length, KPI_MAX);
    if (capKpi >= KPI_MIN && kpiNow > 0 && kpiNow < KPI_MIN) W.push(`${id} "${pg.title || src.name}": chỉ ${kpiNow} thẻ KPI (nên ${KPI_MIN}–${KPI_MAX}).`);
    const unused = src.slots.filter((s) => !used.has(s.key) || (vis.find((x) => x.v.slot === s.key) || { v: { remove: false } }).v.remove);
    const hasSrc = seenFrom.has(src.no); seenFrom.add(src.no);
    out.pages.push({
      id, title: String(pg.title || src.name), message: String(pg.message || ''), from: src.no, fromName: src.name, width: src.width, height: src.height,
      clone: hasSrc, cid: hasSrc ? id.toLowerCase() : '', visuals: vis.map((x) => x.v),
      unusedSlots: unused.filter((s) => s.role !== 'other').map((s) => ({ key: s.key, type: s.type, role: s.role, geom: { x: s.x, y: s.y, w: s.w, h: s.h } })),
      otherSlots: src.slots.filter((s) => s.role === 'other').map((s) => ({ key: s.key, type: s.type, geom: { x: s.x, y: s.y, w: s.w, h: s.h } })),
    });
  });
  diversify(out.pages, W);
  // cảnh báo toàn cục
  const pgsN = out.pages.length, rng = ctx.aud && ctx.aud.pages;
  if (rng && pgsN > rng[1]) W.push(`Có ${pgsN} trang, nhiều hơn mức ${rng[1]} phù hợp người xem trực tiếp.`);
  if (rng && pgsN < rng[0]) W.push(`Chỉ ${pgsN} trang, người xem trực tiếp thường cần ≥ ${rng[0]} trang.`);
  out.pages.forEach((p) => {
    const nk = p.unusedSlots.filter((s) => s.role !== 'kpi').length, kk = p.unusedSlots.length - nk;
    if (nk) W.push(`${p.id} "${p.title}": ${nk} ô của template chưa dùng (khung nền tương ứng sẽ bị bỏ).`);
    if (kk) W.push(`${p.id} "${p.title}": bỏ ${kk} thẻ KPI dư của template (quy tắc tối đa ${KPI_MAX} thẻ/trang).`);
  });
  const text = noDia(out.pages.flatMap((p) => p.visuals.filter((v) => !v.remove).map((v) => v.measure + ' ' + v.title)).join(' '));
  ((form && form.metrics) || []).forEach((m) => { const n = noDia(m).replace(/\(.*$/, '').trim() || noDia(m); if (n && !text.includes(n) && !text.includes(noDia(m))) W.push(`Chỉ số "${m}" chưa xuất hiện trong bố cục.`); });
  const dtext = noDia(out.pages.flatMap((p) => p.visuals.filter((v) => !v.remove).map((v) => v.dimension + ' ' + (v.column ? v.column.column : ''))).join(' '));
  dimsUser.forEach((d) => { const n = noDia(d).replace(/\(.*$/, '').trim() || noDia(d); if (n && !dtext.includes(n) && !dtext.includes(noDia(d))) W.push(`Chiều "${d}" chưa được dùng trong bố cục.`); });
  const skip = pagesOf(tpl).filter((p) => !p.slots.some((s) => s.role !== 'other'));
  if (skip.length) out.notes.push(`Trang template không có biểu đồ dữ liệu (${skip.map((p) => p.name).join(', ')}) — giữ nếu là trang bìa/menu, bỏ các trang còn lại.`);
  return out;
}

// ---------------------------------------------------------------- kế hoạch dự phòng (xác định, không gọi AI)
function heuristic(ctx) {
  const { tpl, form } = ctx; const en = (ctx.lang || 'en') === 'en';
  const cols = columnsOf(ctx.profile, form && form.sheets);
  const metrics = (form.metrics || []).slice(); const dimsAll = (form.dimensions || []).slice();
  if (!metrics.length) metrics.push(en ? 'Total' : 'Tổng');
  const tp = dataPages(tpl);
  const hasDate = cols.some((c) => c.type === 'date');
  const timeDim = dimsAll.find(timeLabel) || (en ? 'Month' : 'Tháng');
  const catDims = dimsAll.filter((d) => !timeLabel(d));
  const dimInfo = (d) => resolveDim(d, cols);
  const lowCard = catDims.map((d) => ({ d, i: dimInfo(d) })).filter((x) => x.i && x.i.distinct).sort((a, b) => a.i.distinct - b.i.distinct);
  const rng = (ctx.aud && ctx.aud.pages) || [2, 4];
  // số trang: 1 trang tổng quan + mỗi chiều phân loại 1 trang chuyên sâu, trong khoảng mức người xem
  const want = Math.max(rng[0], Math.min(rng[1], 1 + Math.max(1, catDims.length), 1 + Math.ceil(metrics.length / 2)));
  const overviewSrc = tp.find((p) => /overview/i.test(p.name)) || [...tp].sort((a, b) => b.slots.filter((s) => s.role === 'kpi').length - a.slots.filter((s) => s.role === 'kpi').length)[0];
  const deepSrc = tp.find((p) => p.no !== overviewSrc.no && p.slots.length >= 4) || overviewSrc;
  const pages = [];
  for (let i = 0; i < want; i++) {
    const src = i === 0 ? overviewSrc : (i % 2 === 1 ? deepSrc : overviewSrc);
    const focusDim = i === 0 ? (catDims[0] || '') : (catDims[(i - 1) % Math.max(1, catDims.length)] || '');
    const shareDim = (lowCard[0] && lowCard[0].d) || focusDim;
    let k = 0, c = 0, sdx = 0, cmp = 0;
    const metric = (n) => metrics[(n + (i === 0 ? 0 : i)) % metrics.length];
    const visuals = [];
    for (const s of src.slots) {
      if (s.role === 'kpi') { if (visuals.filter((x) => x.role === 'kpi').length >= KPI_MAX) continue; const m = metrics[k++ % metrics.length]; visuals.push({ slot: s.key, role: 'kpi', type: s.type, title: m, measure: m }); }
      else if (s.role === 'trend') { const m = metric(c++); visuals.push({ slot: s.key, role: 'trend', type: s.type, title: en ? `${m} over time` : `${m} theo thời gian`, measure: m, dimension: hasDate ? timeDim : '' }); }
      else if (s.role === 'compare') { const fi = Math.max(0, catDims.indexOf(focusDim)); const d = catDims.length ? catDims[(fi + cmp++) % catDims.length] : ''; const m = metric(c++); visuals.push({ slot: s.key, role: 'compare', type: s.type, title: en ? `${m} by ${d || 'category'}` : `${m} theo ${d || 'nhóm'}`, measure: m, dimension: d }); }
      else if (s.role === 'share') { const d = shareDim; const m = metric(sdx++); visuals.push({ slot: s.key, role: 'share', type: s.type, title: en ? `${m} share by ${d || 'category'}` : `Tỷ trọng ${m} theo ${d || 'nhóm'}`, measure: m, dimension: d }); }
      else if (s.role === 'filter') { const d = hasDate && !visuals.some((x) => x.role === 'filter') ? (en ? 'Year' : 'Năm') : (catDims[visuals.filter((x) => x.role === 'filter').length % Math.max(1, catDims.length)] || ''); visuals.push({ slot: s.key, role: 'filter', type: s.type, title: d, measure: '', dimension: d }); }
      else if (s.role === 'detail') { const d = focusDim || catDims[0] || ''; visuals.push({ slot: s.key, role: 'detail', type: s.type, title: en ? 'Details' : 'Chi tiết', measure: metrics.slice(0, 4).join(', '), dimension: d }); }
    }
    pages.push({
      title: i === 0 ? (en ? 'Overview' : 'Tổng quan') : (en ? `${focusDim || 'Detail'} analysis` : `Phân tích theo ${focusDim || 'chi tiết'}`),
      message: i === 0 ? (en ? 'The big picture: key indicators, trend and where the value comes from.' : 'Bức tranh chung: chỉ số chính, xu hướng và giá trị đến từ đâu.') : (en ? `Drill into ${focusDim || 'the details'} to see what drives the headline numbers.` : `Đi sâu theo ${focusDim || 'chi tiết'} để thấy điều gì tạo nên các con số tổng quan.`),
      from: src.no, visuals,
    });
  }
  return { storyline: en ? 'From the overall picture to the drivers: start with headline KPIs and trend, then break down by each requested dimension.' : 'Từ bức tranh chung đến nguyên nhân: mở đầu bằng KPI và xu hướng, rồi phân rã theo từng chiều người dùng yêu cầu.', pages };
}

// ---------------------------------------------------------------- prompt cho AI
function buildPrompt(o) {
  const { form, tpl, profile, feedback, prev, audMd, indirectMd, ctxText, reqText } = o; const en = (o.lang || 'en') === 'en';
  const cols = columnsOf(profile, form.sheets);
  const colMd = '| Bảng/sheet | Cột | Kiểu | Số giá trị khác nhau (distinct) | Ghi chú |\n|---|---|---|---|---|\n' + cols.map((c) => `| ${c.table} | ${c.column} | ${c.type} | ${c.distinct} | ${c.type === 'date' ? `${c.min} → ${c.max}` : ''} |`).join('\n');
  const L = [];
  L.push('Bạn là chuyên gia Business Intelligence. Hãy ĐỀ XUẤT BỐ CỤC dashboard Power BI (các trang và biểu đồ) để người dùng review TRƯỚC khi dựng. Trả lời tiếng Việt cho phần giải thích (`message`, `reason`, `storyline`), còn chữ hiển thị trên dashboard (`title`) bằng ' + (en ? 'TIẾNG ANH' : 'TIẾNG VIỆT') + '.');
  L.push('## Ngữ cảnh\n' + (ctxText || '(không có)').slice(0, 5000) + '\n\n## Yêu cầu phân tích\n' + (reqText || '(không có)').slice(0, 3000));
  L.push('## Người xem TRỰC TIẾP (thiết kế cho họ)\n' + audMd + (indirectMd ? '\n\n## Người xem GIÁN TIẾP\n' + indirectMd : ''));
  L.push('## Chỉ số người dùng chọn\n' + (form.metrics || []).map((m) => '- ' + m).join('\n') + '\n\n## Chiều (dimension) người dùng chọn\n' + (form.dimensions || []).map((m) => '- ' + m).join('\n') + '\n\n## Kỳ so sánh\n' + ((form.periods || []).concat(form.versions || []).join(', ') || '(không)'));
  L.push('## Cột dữ liệu (số giá trị khác nhau để quyết định Top N)\n' + colMd + '\nBảng thời gian `Calendar` (nếu có cột ngày) có cột Year, Quarter, YearQuarter, Month, YearMonth.');
  L.push('## Template Power BI: ' + tpl.name + '\nMỗi trang template có một số Ô cố định (slot) với loại biểu đồ cố định. BẠN KHÔNG thêm ô — chỉ chọn nội dung cho các ô có sẵn. Một trang template có thể dùng LẠI cho nhiều trang dashboard (bản nhân bản) khi cần nhiều trang hơn template có.\n\n' + slotSummaryMd(tpl));
  L.push(['## Quy tắc bắt buộc',
    '- Mỗi trang dashboard bám 1 trang template (`from` = số trang template). Dùng đúng `slot` (key) của trang đó, mỗi ô tối đa 1 lần; cố gắng LẤP ĐỦ các ô để giữ đúng số biểu đồ của trang template (ô "other" như map/scatter có thể bỏ).',
    '- Số trang: nằm trong mức người xem trực tiếp; đủ trang để mọi chỉ số và mọi chiều được dùng ít nhất 1 lần.',
    '- Mỗi trang 4–6 thẻ KPI tổng quan (ô nhóm kpi) — không quá 6.',
    '- Kể một câu chuyện: tổng quan → xu hướng → so sánh/phân rã theo chiều → chi tiết. Mỗi trang có 1 thông điệp (`message`), tiêu đề biểu đồ nêu thông điệp.',
    '- Chọn biểu đồ đúng câu hỏi (xu hướng = line/area theo thời gian; so sánh nhóm = bar/column đã sắp xếp; tỷ trọng = donut/pie ≤ 5 phần; chi tiết = table). `type` chỉ được đổi trong cùng họ với loại của ô (cột/thanh/đường/vùng; pie/donut).',
    '- ĐA DẠNG, KHÔNG LẶP LẠI giữa các trang: mỗi trang kể một góc phân tích khác (chiều + chỉ số + loại biểu đồ khác). Các trang dùng chung một trang template phải khác nhau về loại biểu đồ trong họ cho phép (vd. trang 1 dùng Column theo Region, trang 2 dùng Bar theo Product, trang 3 dùng Stacked/Area…), và mỗi ô so sánh trong một trang nên dùng chiều khác nhau. Chọn loại theo dữ liệu: ít giá trị (≤ 6) → column/donut; nhiều giá trị (> 8) → bar ngang đã sắp xếp + Top N; chỉ số dạng tỷ lệ/giá/trung bình → line; chỉ số cộng dồn/khối lượng theo thời gian → area/column; cần thấy cơ cấu trong từng nhóm → stacked.',
    '- Giới hạn số giá trị hiển thị: bar ≤ 15, column ≤ 12, donut/pie ≤ 5, treemap ≤ 20. Chiều có nhiều giá trị hơn (xem distinct) → đặt `topN` (vd 10) hoặc chọn chiều khác/biểu đồ khác. Pie/donut KHÔNG dùng với chiều nhiều giá trị.',
    '- `dimension` dùng đúng tên chiều người dùng chọn (hoặc "Month"/"Year"/"Quarter" cho trục thời gian). `measure` dùng đúng tên chỉ số người dùng chọn.'].join('\n'));
  if (prev) L.push('## Bố cục hiện tại (người dùng đã xem)\n```json\n' + JSON.stringify(compact(prev), null, 1) + '\n```');
  if (feedback) L.push('## GÓP Ý CỦA NGƯỜI DÙNG — phải áp dụng\n' + feedback);
  L.push('## Định dạng trả về\nChỉ trả về MỘT JSON object, không markdown:\n```\n{"storyline":"câu chuyện của dashboard (2-3 câu)","pages":[{"title":"...","message":"thông điệp trang","from":2,"visuals":[{"slot":"2.56ba69","type":"cardVisual","title":"...","measure":"tên chỉ số","dimension":"tên chiều hoặc rỗng","topN":null,"reason":"vì sao chọn"}]}]}\n```');
  return L.join('\n\n');
}
function compact(plan) {
  return { storyline: plan.storyline, pages: (plan.pages || []).map((p) => ({ title: p.title, message: p.message, from: p.from, visuals: (p.visuals || []).filter((v) => !v.remove).map((v) => ({ slot: v.slot, type: v.type, title: v.title, measure: v.measure, dimension: v.dimension, topN: v.topN, note: v.note || undefined })) })) };
}
function parseAi(text) {
  const m = String(text).match(/\{[\s\S]*\}/); if (!m) throw new Error('AI không trả về JSON');
  const j = JSON.parse(m[0]); if (!Array.isArray(j.pages) || !j.pages.length) throw new Error('JSON thiếu mảng pages');
  return j;
}

// ---------------------------------------------------------------- plan → chặng 4
/** Khung dashboard-spec (chế độ template) suy ra từ plan: keep/clones/order/rename + bind từng ô (model điền roles) */
function toSpecSkeleton(plan, tpl) {
  const man = tpl.manifest; const pages = { keep: [], clones: [], rename: {}, order: [] };
  const cover = man.pages.filter((p) => !p.tooltip && !p.visuals.some((v) => v.kind === 'data') && (p.no === 1 || /home|cover|intro|welcome|menu|index/i.test(p.name)));
  cover.forEach((p) => { pages.keep.push(String(p.no)); pages.order.push(String(p.no)); });
  const bind = {};
  for (const pg of plan.pages) {
    const mp = man.pages.find((p) => p.no === pg.from);
    if (pg.clone) { pages.clones.push({ id: pg.cid, from: String(pg.from), name: pg.title }); pages.order.push(pg.cid); }
    else { pages.keep.push(String(pg.from)); pages.rename[String(pg.from)] = pg.title; pages.order.push(String(pg.from)); }
    for (const v of pg.visuals) {
      if (v.remove || !v.slot) continue;
      const slot = mp && mp.visuals.find((x) => x.key === v.slot);
      const roles = {};
      let gotM = false, gotD = false;
      for (const [r, info] of Object.entries((slot && slot.roles) || {})) {
        if (info.kind === 'measure') { roles[r] = gotM ? '<measure khác nếu cần>' : `<measure: ${v.measure || '?'}>`; gotM = true; }
        else { roles[r] = gotD ? '<cột khác nếu cần>' : `<cột: ${v.dimension || '?'}${v.column ? ' → ' + v.column.table + '.' + v.column.column : ''}>`; gotD = true; }
      }
      const b = { title: v.title, roles };
      if (v.type !== v.slotType) b.visualType = v.type;
      if (v.topN) b.topN = v.topN;
      bind[(pg.clone ? pg.cid + ':' : '') + v.slot] = b;
    }
  }
  return { pages, bind, texts: {} };
}
function toMarkdown(plan, tpl) {
  const L = [`# BỐ CỤC DASHBOARD ĐÃ ĐƯỢC NGƯỜI DÙNG DUYỆT (BẮT BUỘC TUÂN THỦ)`, `Template: **${plan.template.name}** · ${plan.pages.length} trang · câu chuyện: ${plan.storyline || '—'}`, ''];
  for (const p of plan.pages) {
    L.push(`## ${p.id} "${p.title}" — dùng trang template ${p.from} "${p.fromName}"${p.clone ? ` (BẢN NHÂN BẢN, cloneId \`${p.cid}\` → khóa bind dạng \`${p.cid}:<key>\`)` : ''}`, `Thông điệp: ${p.message || '—'}`, '| key ô | loại cuối | tiêu đề | chỉ số | chiều (cột) | Top N | góp ý của người dùng |', '|---|---|---|---|---|---|---|');
    for (const v of p.visuals.filter((x) => !x.remove && x.slot)) L.push(`| ${v.slot} | ${v.type}${v.type !== v.slotType ? ` (gốc ${v.slotType})` : ''} | ${v.title} | ${v.measure || ''} | ${v.dimension || ''}${v.column ? ` → ${v.column.table}.${v.column.column}` : ''}${v.distinct ? ` (${v.distinct} giá trị)` : ''} | ${v.topN || ''} | ${v.note || ''} |`);
    const off = p.visuals.filter((x) => x.remove || !x.slot); if (off.length) L.push(`Đã loại: ${off.map((v) => v.title || v.id).join('; ')}`);
    if (p.unusedSlots.length) L.push(`Ô template không dùng (để trống → bỏ): ${p.unusedSlots.map((s) => s.key).join(', ')}`);
    L.push('');
  }
  L.push('## Khung dashboard-spec.json suy ra từ bố cục (điền `roles`, giữ nguyên phần còn lại; thay `<measure: …>` bằng đúng tên measure trong measures.json, `<cột: …>` bằng `{"table":"…","column":"…"}` theo model-spec.json)', '```json', JSON.stringify(toSpecSkeleton(plan, tpl), null, 1), '```');
  L.push('', 'Quy tắc: số trang, thứ tự, loại biểu đồ (`visualType`), `topN`, tiêu đề phải ĐÚNG như khung trên. `topN` do script sinh measure xếp hạng — bạn chỉ khai báo số. Không thêm biểu đồ ngoài các ô liệt kê.');
  return L.join('\n');
}

module.exports = { rankTypes, diversify, roleOf, typeOptions, pagesOf, dataPages, columnsOf, resolveDim, normalize, heuristic, buildPrompt, parseAi, toSpecSkeleton, toMarkdown, compact, LIMIT, KPI_MIN, KPI_MAX };
