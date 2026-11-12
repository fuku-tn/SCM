'use strict';
/**
 * Danh mục chỉ số BI (knowledge-base/metrics-catalog.json, sinh từ documents/Business Intelligence Metrics.xlsx):
 *  - đưa danh mục cho giao diện chọn chỉ số (theo lĩnh vực → nhóm → chỉ số)
 *  - tra chỉ số theo tên (không phân biệt hoa/thường, dấu, phần trong ngoặc)
 *  - chấm "khớp dữ liệu": công thức của chỉ số có dùng được các cột trong dữ liệu người dùng không
 *  - đưa ĐỊNH NGHĨA (mô tả + công thức) của chỉ số đã chọn vào prompt chặng Key Metrics
 */
const fs = require('fs');
const path = require('path');
const { noDia } = require('./samples.js');

const FILE = path.join(__dirname, '..', 'knowledge-base', 'metrics-catalog.json');
const FILE_VI = path.join(__dirname, '..', 'knowledge-base', 'metrics-vi.json');   // định nghĩa tiếng Việt (khóa = id chỉ số); thiếu thì dùng mô tả tiếng Anh gốc
let cache = null, mtime = 0;
function readVi() { try { return JSON.parse(fs.readFileSync(FILE_VI, 'utf8').replace(/^﻿/, '')).definitions || {}; } catch { return {}; } }
const stamp = () => { let t = 0; for (const f of [FILE, FILE_VI]) { try { t += fs.statSync(f).mtimeMs; } catch {} } return t; };
function load() {
  try {
    const t = stamp();
    if (!cache || t !== mtime) {
      const c = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '')), vi = readVi();
      for (const d of c.domains || []) for (const k of d.categories || []) for (const m of k.metrics || []) { m.descriptionEn = m.description; if (vi[m.id]) m.description = vi[m.id]; }
      cache = c; mtime = t;
    }
  } catch { cache = cache || { version: 1, domains: [] }; }
  return cache;
}
const all = () => load().domains.flatMap((d) => d.categories.flatMap((c) => c.metrics.map((m) => ({ ...m, domain: d.id, domainLabel: d.label, category: c.name }))));

/** chuẩn hóa tên để so khớp: bỏ dấu, bỏ phần trong ngoặc, ký tự lạ */
const keyOf = (s) => noDia(String(s || '').replace(/\([^)]*\)/g, ' ')).replace(/[^a-z0-9]+/g, ' ').trim();
const abbrOf = (s) => { const m = String(s || '').match(/\(([A-Za-z0-9&%\- ]{2,12})\)/); return m ? noDia(m[1]).replace(/[^a-z0-9]+/g, '') : ''; };
let idx = null, idxAt = 0;
function index() {
  if (idx && idxAt === mtime && cache) return idx;
  idx = { byKey: new Map(), byAbbr: new Map() };
  for (const m of all()) { const k = keyOf(m.name); if (!idx.byKey.has(k)) idx.byKey.set(k, m); const ab = abbrOf(m.name); if (ab && !idx.byAbbr.has(ab)) idx.byAbbr.set(ab, m); }
  idxAt = mtime; return idx;
}
/** tra 1 tên chỉ số (người dùng gõ / AI gợi ý) → mục trong danh mục hoặc null */
function lookup(name) {
  load(); const ix = index(); const raw = String(name || '');
  const k = keyOf(raw); if (k && ix.byKey.has(k)) return ix.byKey.get(k);
  const ab = abbrOf(raw); if (ab && ix.byAbbr.has(ab)) return ix.byAbbr.get(ab);
  const plain = noDia(raw).replace(/[^a-z0-9]+/g, ''); if (plain && plain.length <= 6 && ix.byAbbr.has(plain)) return ix.byAbbr.get(plain);   // "CLV", "NPS"
  return null;
}

// ---------------------------------------------------------------- khớp dữ liệu
const STOP = new Set(['sum', 'of', 'total', 'number', 'average', 'avg', 'all', 'per', 'the', 'by', 'and', 'for', 'to', 'in', 'on', 'a', 'an', 'x', 'time', 'period', 'current', 'previous', 'provided', 'platforms', 'platform', 'ad', 'analytics', 'survey', 'metric', 'based', 'customer', 'feedback', 'total']);
const SYN = {
  revenue: ['revenue', 'sales', 'doanh thu', 'amount', 'turnover', 'income', 'thanh tien'], sales: ['sales', 'revenue', 'doanh thu', 'ban'],
  cogs: ['cogs', 'cost', 'gia von', 'chi phi'], cost: ['cost', 'chi phi', 'cogs', 'gia von', 'expense'], profit: ['profit', 'loi nhuan', 'margin'], expense: ['expense', 'cost', 'chi phi'],
  customers: ['customer', 'khach hang', 'client'], customer: ['customer', 'khach hang', 'client'], orders: ['order', 'don hang', 'don'], order: ['order', 'don hang', 'don'],
  units: ['unit', 'quantity', 'qty', 'so luong'], quantity: ['quantity', 'qty', 'unit', 'so luong'], employees: ['employee', 'nhan vien', 'staff', 'headcount'], employee: ['employee', 'nhan vien', 'staff', 'headcount'],
  hires: ['hire', 'tuyen', 'candidate'], leads: ['lead'], deals: ['deal', 'opportunity', 'co hoi'], clicks: ['click'], impressions: ['impression'], conversions: ['conversion', 'convert'],
  inventory: ['inventory', 'stock', 'ton kho'], budget: ['budget', 'ngan sach', 'plan', 'ke hoach'], target: ['target', 'muc tieu', 'plan'],
};
const tok = (s) => noDia(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length > 2 && !STOP.has(t));
function formulaTerms(f) {
  if (!f || /provided by|survey metric|platform/i.test(f)) return [];
  return String(f).split(/[÷×()+*/=,−]|\s-\s|\bof\b|\bper\b/i).map((x) => x.replace(/[%\d.]+/g, ' ').replace(/\s+/g, ' ').trim()).filter((x) => x && tok(x).length).map((x) => ({ label: x, toks: tok(x) }));
}
/** chi tiết khớp dữ liệu: { level: 'high'|'partial'|'none'|null, missing: [thành phần công thức chưa thấy cột], total } */
function fitDetail(metric, profile) {
  const cols = ((profile && profile.sheets) || []).flatMap((s) => (s.columns || []).map((c) => noDia(c.name)));
  if (!cols.length) return { level: null, missing: [], total: 0 };
  const terms = formulaTerms(metric.formula); if (!terms.length) return { level: 'none', missing: [], total: 0, unknownFormula: true };
  const hasCol = (t) => { const alts = [t, ...(SYN[t] || [])]; return cols.some((c) => alts.some((a) => c.includes(a))); };
  const miss = terms.filter((tk) => !tk.toks.some(hasCol));
  const r = (terms.length - miss.length) / terms.length;
  return { level: r >= 0.99 ? 'high' : r > 0 ? 'partial' : 'none', missing: miss.map((t) => t.label), total: terms.length };
}
/** profile: { sheets:[{ columns:[{name}] }] } → 'high' | 'partial' | 'none' | null (chưa có dữ liệu) */
const fit = (metric, profile) => fitDetail(metric, profile).level;
/** đoán lĩnh vực từ phòng ban/vị trí của người xem trực tiếp */
function domainFor(...texts) {
  const s = noDia(texts.filter(Boolean).join(' ')); if (!s.trim()) return null;
  let best = null, bestN = 0;
  for (const d of load().domains) { const n = (d.match || []).filter((w) => s.includes(noDia(w))).length; if (n > bestN) { best = d.id; bestN = n; } }
  return best;
}

/** phần định nghĩa chỉ số đã chọn đưa vào prompt */
function definitionsMd(names) {
  const found = []; const seen = new Set();
  for (const n of names || []) { const m = lookup(n); if (m && !seen.has(m.id)) { seen.add(m.id); found.push({ asked: n, m }); } }
  if (!found.length) return '';
  const L = ['## ĐỊNH NGHĨA CHỈ SỐ TỪ DANH MỤC BI METRICS (ưu tiên dùng đúng công thức này)',
    'Các chỉ số bên dưới có trong danh mục chuẩn của doanh nghiệp. Dùng đúng tên, ý nghĩa và công thức; nếu dữ liệu thiếu cột để tính thì ghi [Giả định] hoặc báo "chưa tính được", không tự đổi công thức.', '',
    '| Chỉ số người dùng chọn | Lĩnh vực / nhóm | Mô tả | Công thức | Mức quan trọng |', '|---|---|---|---|---|'];
  for (const { asked, m } of found) L.push(`| ${asked} | ${m.domainLabel} / ${m.category} | ${m.description} | ${m.formula} | ${m.importance} |`);
  return L.join('\n');
}
/** danh sách tên (kèm lĩnh vực) gọn cho prompt gợi ý AI */
function namesForPrompt(domainId) {
  const L = [];
  for (const d of load().domains) { if (domainId && d.id !== domainId) continue; L.push(`- ${d.label}: ` + d.categories.flatMap((c) => c.metrics.map((m) => m.name)).join('; ')); }
  return L.join('\n');
}
module.exports = { load, all, lookup, fit, fitDetail, domainFor, definitionsMd, namesForPrompt, keyOf };
