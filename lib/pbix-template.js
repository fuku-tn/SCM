'use strict';
/**
 * Xử lý template Power BI (.pbix) — dùng chung cho giao diện (chọn template), prompt (manifest) và script dựng PBIP.
 *
 * Template là file .pbix lưu ở định dạng PBIR (Report/definition/...). Ta coi mỗi template là một "vỏ" giao diện:
 *   - GIỮ NGUYÊN: nền trang, hình ảnh, logo, shape, nút chuyển trang, textbox, theme, định dạng từng biểu đồ
 *   - GẮN LẠI DỮ LIỆU: các biểu đồ dữ liệu (card, line, donut, pivot, slicer...) được gắn vào measure/cột của người dùng
 *   - BỎ: biểu đồ dữ liệu không gắn được, bookmark, drillthrough, bộ lọc / tham chiếu tới trường của template
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const ROOT = process.env.BIE_ROOT || path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const CACHE = path.join(TEMPLATES, '.cache');

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^dashboard[\s_-]+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const ieq = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// ---------------------------------------------------------------- tìm & giải nén
function findPbix() {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.cache') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.pbix$/i.test(e.name)) out.push(p);
    }
  };
  walk(TEMPLATES);
  return out.sort();
}
function ensureUnpacked(file, cacheId) {
  const st = fs.statSync(file);
  const id = cacheId || slug(path.basename(file, path.extname(file)));
  const key = `${id}-${st.size}-${Math.round(st.mtimeMs)}`;
  const dir = path.join(CACHE, key);
  if (fs.existsSync(path.join(dir, '.done'))) return { id, dir: path.join(dir, 'Report') };
  fs.mkdirSync(CACHE, { recursive: true });
  for (const d of fs.readdirSync(CACHE)) if (d.startsWith(id + '-') && d !== key) fs.rmSync(path.join(CACHE, d), { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  const z = new AdmZip(file);
  if (!z.getEntries().some((e) => /^Report\/definition\/pages\//.test(e.entryName))) {
    throw new Error('File .pbix chưa ở định dạng PBIR (không thấy Report/definition/pages). Trong Power BI Desktop: File → Options and settings → Options → Preview features → bật "Store reports using enhanced metadata format (PBIR)", mở lại file, Save rồi tải lên lại.');
  }
  for (const e of z.getEntries()) {
    if (e.isDirectory || !/^Report\/(definition|StaticResources)\//.test(e.entryName)) continue;
    const p = path.join(dir, e.entryName); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.getData());
  }
  fs.writeFileSync(path.join(dir, '.done'), '1');
  return { id, dir: path.join(dir, 'Report') };
}

// ---------------------------------------------------------------- phân tích
const textOf = (v) => {
  const ps = v.visual && v.visual.objects && v.visual.objects.general && v.visual.objects.general[0] && v.visual.objects.general[0].properties && v.visual.objects.general[0].properties.paragraphs;
  return (ps || []).map((p) => (p.textRuns || []).map((r) => r.value).join('')).join(' / ');
};
const litStr = (e) => { const l = e && e.expr && e.expr.Literal && e.expr.Literal.Value; return typeof l === 'string' ? l.replace(/^'|'$/g, '').replace(/''/g, "'") : null; };
function fieldName(f) {
  const k = f.Column ? 'Column' : f.Measure ? 'Measure' : f.Aggregation ? 'Aggregation' : f.HierarchyLevel ? 'HierarchyLevel' : null;
  if (!k) return '?';
  const x = f[k];
  if (k === 'Aggregation') return fieldName(x.Expression || {});
  if (k === 'HierarchyLevel') return (x.Level || '') ;
  const ent = x.Expression && x.Expression.SourceRef && x.Expression.SourceRef.Entity;
  return `${ent || '?'}.${x.Property}`;
}
const DECOR = new Set(['shape', 'image', 'actionButton', 'basicShape']);
function readVisuals(dir, pageId) {
  const vdir = path.join(dir, 'definition', 'pages', pageId, 'visuals');
  if (!fs.existsSync(vdir)) return [];
  return fs.readdirSync(vdir).filter((n) => fs.existsSync(path.join(vdir, n, 'visual.json'))).map((n) => ({ dirName: n, json: readJson(path.join(vdir, n, 'visual.json')) }));
}
function buildManifest(dir, meta) {
  const pages = readJson(path.join(dir, 'definition', 'pages', 'pages.json'));
  const out = { id: meta.id, name: meta.name, pages: [], resources: [] };
  pages.pageOrder.forEach((pid, pi) => {
    const pj = readJson(path.join(dir, 'definition', 'pages', pid, 'page.json'));
    const vs = readVisuals(dir, pid);
    const page = { no: pi + 1, id: pid, name: pj.displayName, width: pj.width, height: pj.height, tooltip: pj.type === 'Tooltip', hidden: pj.visibility === 'HiddenInViewMode', visuals: [] };
    const used = new Set();
    for (const { json: v } of vs) {
      let short = v.name.slice(0, 6); while (used.has(short)) short = v.name.slice(0, short.length + 1); used.add(short);
      const t = v.visual ? v.visual.visualType : 'group';
      const item = { key: `${pi + 1}.${short}`, name: v.name, type: t, x: Math.round(v.position.x), y: Math.round(v.position.y), w: Math.round(v.position.width), h: Math.round(v.position.height), z: v.position.z, hiddenVisual: !!v.isHidden, parent: v.parentGroupName || null };
      if (!v.visual) item.kind = 'group';
      else if (t === 'textbox') { item.kind = 'text'; item.text = textOf(v); }
      else if (DECOR.has(t)) {
        item.kind = 'decor';
        const vl = v.visual.visualContainerObjects && v.visual.visualContainerObjects.visualLink && v.visual.visualContainerObjects.visualLink[0];
        if (vl) { item.link = litStr(vl.properties.type); if (vl.properties.navigationSection) item.linkTo = litStr(vl.properties.navigationSection); }
      } else if (v.visual.query && v.visual.query.queryState) {
        item.kind = 'data'; item.roles = {}; item.hints = [];
        for (const [role, st] of Object.entries(v.visual.query.queryState)) {
          const ps = st.projections || [];
          item.roles[role] = { count: ps.length, kind: ps.every((p) => p.field.Measure) ? 'measure' : ps.every((p) => !p.field.Measure) ? 'column' : 'mixed' };
          ps.forEach((p) => item.hints.push(`${role}:${fieldName(p.field)}`));
        }
        const tt = v.visual.visualContainerObjects && v.visual.visualContainerObjects.title && v.visual.visualContainerObjects.title[0];
        item.title = tt && tt.properties && tt.properties.text ? litStr(tt.properties.text) : null;
      } else item.kind = 'decor';
      page.visuals.push(item);
    }
    page.visuals.sort((a, b) => a.y - b.y || a.x - b.x);
    out.pages.push(page);
  });
  const rp = path.join(dir, 'definition', 'report.json');
  if (fs.existsSync(rp)) { const rj = readJson(rp); out.theme = rj.themeCollection || null; }
  return out;
}

const memo = new Map();
function loadTemplate(id) {
  const f = findPbix().find((x) => slug(path.basename(x, '.pbix')) === id);
  if (!f) return null;
  const st = fs.statSync(f); const mk = `${id}:${st.size}:${Math.round(st.mtimeMs)}`;
  if (memo.has(mk)) return memo.get(mk);
  const { dir } = ensureUnpacked(f);
  const manifest = buildManifest(dir, { id, name: path.basename(f, '.pbix') });
  const r = { id, name: manifest.name, file: f, dir, manifest };
  memo.set(mk, r); return r;
}
/** Template từ một file .pbix bất kỳ (người dùng tải lên). id/name do người gọi đặt. */
function loadTemplateFile(file, o = {}) {
  const st = fs.statSync(file); const id = o.id || 'upload';
  const mk = `file:${file}:${st.size}:${Math.round(st.mtimeMs)}`;
  if (memo.has(mk)) return memo.get(mk);
  const cacheId = 'up' + crypto.createHash('md5').update(path.resolve(file)).digest('hex').slice(0, 10);
  const { dir } = ensureUnpacked(file, cacheId);
  const name = o.name || path.basename(file, '.pbix');
  const manifest = buildManifest(dir, { id, name });
  const r = { id, name, file, dir, manifest, uploaded: true };
  memo.set(mk, r); return r;
}
/** Template của một phiên chạy: file người dùng tải lên (templateSource='upload') hoặc template trong thư mục templates/ */
function resolveForRun(runDir, form) {
  const f = form || {};
  if (f.templateSource === 'upload') {
    const d = path.join(runDir, '00-input', 'pbix');
    const n = fs.existsSync(d) ? fs.readdirSync(d).find((x) => /\.pbix$/i.test(x)) : null;
    return n ? loadTemplateFile(path.join(d, n), { id: 'upload', name: n.replace(/\.pbix$/i, '') }) : null;
  }
  return f.template ? loadTemplate(String(f.template)) : null;
}
function describe(t) {
  const m = t.manifest, pages = m.pages.filter((p) => !p.tooltip);
  return {
    id: t.id, name: m.name, file: path.relative(ROOT, t.file).replace(/\\/g, '/'), sizeMB: Math.round(fs.statSync(t.file).size / 1048576 * 10) / 10, uploaded: !!t.uploaded,
    pages: pages.map((p) => ({ no: p.no, name: p.name, width: p.width, height: p.height, dataVisuals: p.visuals.filter((v) => v.kind === 'data').length, totalVisuals: p.visuals.length })),
    tooltipPages: m.pages.length - pages.length, hasPreview: !!previewImage(t),
    dataVisuals: m.pages.reduce((n, p) => n + p.visuals.filter((v) => v.kind === 'data').length, 0),
    themeColors: themeColors(t),
  };
}
function previewImage(t) {
  // ảnh nền của trang "Overview" (hoặc trang đầu có nền ảnh) làm hình xem trước
  const m = t.manifest; const order = [...m.pages.filter((p) => /overview/i.test(p.name)), ...m.pages];
  for (const p of order) {
    const pj = readJson(path.join(t.dir, 'definition', 'pages', p.id, 'page.json'));
    const bg = pj.objects && pj.objects.background && pj.objects.background[0] && pj.objects.background[0].properties && pj.objects.background[0].properties.image;
    const item = bg && bg.image && bg.image.url && bg.image.url.expr && bg.image.url.expr.ResourcePackageItem && bg.image.url.expr.ResourcePackageItem.ItemName;
    if (item) { const f = path.join(t.dir, 'StaticResources', 'RegisteredResources', item); if (fs.existsSync(f)) return f; }
  }
  return null;
}
/** Sơ đồ khung (SVG) của trang chính: vẽ từ vị trí thật của biểu đồ dữ liệu / chữ / hình để xem trước bố cục */
function wireframeSvg(t) {
  const m = t.manifest;
  const page = m.pages.find((p) => /overview/i.test(p.name) && !p.tooltip) || m.pages.find((p) => !p.tooltip && p.visuals.some((v) => v.kind === 'data')) || m.pages[0];
  const W = page.width, H = page.height, sw = Math.max(2, Math.round(W / 400)), fs = Math.round(W / 52);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice">`];
  for (const v of page.visuals.slice().sort((a, b) => a.z - b.z)) {
    if (v.kind === 'group' || v.hiddenVisual) continue;
    const r = `x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}"`;
    if (v.kind === 'data') L.push(`<rect ${r} rx="${sw * 3}" fill="rgba(200,169,107,.30)" stroke="#B08D3C" stroke-width="${sw}"/><text x="${v.x + v.w / 2}" y="${v.y + v.h / 2 + fs / 3}" font-family="Segoe UI,Arial" font-size="${fs}" font-weight="600" text-anchor="middle" fill="#3a3220">${esc(v.type.replace(/Visual$|Chart$/, ''))}</text>`);
    else if (v.kind === 'text') L.push(`<rect ${r} fill="rgba(13,23,38,.10)" rx="${sw}"/>`);
    else if (v.type === 'image') L.push(`<rect ${r} fill="rgba(110,125,150,.22)" rx="${sw}"/>`);
    else L.push(`<rect ${r} fill="rgba(255,255,255,.38)" stroke="rgba(13,23,38,.18)" stroke-width="${sw / 2}" rx="${sw * 2}"/>`);
  }
  L.push('</svg>');
  return L.join('');
}
function listTemplates() {
  return findPbix().map((f) => describe(loadTemplate(slug(path.basename(f, '.pbix')))));
}
function themeColors(t) {
  try {
    const rj = readJson(path.join(t.dir, 'definition', 'report.json')); const ct = rj.themeCollection && rj.themeCollection.customTheme;
    if (!ct) return [];
    const j = readJson(path.join(t.dir, 'StaticResources', 'RegisteredResources', ct.name));
    return (j.dataColors || []).slice(0, 6);
  } catch { return []; }
}

// ---------------------------------------------------------------- manifest dạng Markdown cho prompt
function manifestMarkdown(t) {
  const m = t.manifest, L = [];
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  L.push(`# TEMPLATE POWER BI ĐÃ CHỌN: "${m.name}" (id: ${m.id})`);
  L.push('Đầu ra phải GIỐNG template này: giữ nguyên nền, hình, logo, nút chuyển trang, theme và định dạng; bạn chỉ quyết định **gắn dữ liệu của người dùng** vào các biểu đồ dữ liệu, thay chữ trong textbox, và bỏ phần không phù hợp.');
  L.push('Mỗi dòng có `key` dạng `<số trang>.<mã>` — dùng đúng key này trong dashboard-spec.json.');
  for (const p of m.pages) {
    const data = p.visuals.filter((v) => v.kind === 'data'), text = p.visuals.filter((v) => v.kind === 'text'), decor = p.visuals.filter((v) => v.kind === 'decor'), nav = decor.filter((v) => v.linkTo);
    L.push(`\n## Trang ${p.no}: "${p.name}" — ${p.width}×${p.height}px${p.tooltip ? ' · TRANG TOOLTIP (ẩn; hiện khi rê chuột lên biểu đồ khác)' : ''}`);
    L.push(`${data.length} biểu đồ dữ liệu · ${text.length} textbox · ${decor.length} hình/shape/nút (giữ nguyên)${nav.length ? ` · ${nav.length} nút chuyển trang` : ''}`);
    const kpiN = data.filter((v) => KPI_TYPES.has(v.type)).length;
    if (kpiN) L.push(`**QUY TẮC KPI:** trang này có ${kpiN} thẻ KPI (card/cardVisual). Chỉ được gắn **${KPI_MIN}–${KPI_MAX} thẻ KPI tổng quan** (tối đa ${KPI_MAX}, nếu hơn cấu trúc trình bày bị vỡ): chọn các chỉ số quan trọng nhất, phần thẻ còn lại đưa vào \`drop\`.${kpiN < KPI_MIN ? ` (template chỉ có ${kpiN} thẻ nên gắn hết ${kpiN}.)` : ''}`);
    if (data.length) {
      L.push('', '### Biểu đồ dữ liệu (cần gắn dữ liệu hoặc bỏ)', '| key | loại | vị trí x,y (rộng×cao) | vai trò dữ liệu (số trường template dùng) | template đang dùng |', '|---|---|---|---|---|');
      for (const v of data) L.push(`| ${v.key}${v.hiddenVisual ? ' (ẩn)' : ''} | ${v.type} | ${v.x},${v.y} (${v.w}×${v.h}) | ${Object.entries(v.roles).map(([r, x]) => `${r}×${x.count} ${x.kind === 'measure' ? 'measure' : x.kind === 'column' ? 'cột' : 'cột/measure'}`).join('; ')} | ${cut(v.hints.join(', '), 90)}${v.title ? ` — tiêu đề "${cut(v.title, 40)}"` : ''} |`);
    }
    if (text.length) {
      L.push('', '### Textbox (thay chữ hoặc bỏ; không liệt kê = giữ nguyên chữ cũ của template)', '| key | vị trí x,y (rộng×cao) | chữ hiện tại |', '|---|---|---|');
      for (const v of text) L.push(`| ${v.key} | ${v.x},${v.y} (${v.w}×${v.h}) | ${cut(v.text, 110)} |`);
    }
    if (nav.length) L.push('', '### Nút chuyển trang (tự giữ): ' + nav.map((v) => `${v.key}→trang "${(m.pages.find((x) => x.id === v.linkTo) || {}).name || '?'}"`).join(', '));
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- áp template
const FIELD_ROLES_DIM = new Set(['Category', 'Group', 'Rows', 'Columns', 'Series', 'Details', 'Legend', 'Breakdown', 'Location', 'Latitude', 'Longitude', 'Axis']);
const SLICERS = new Set(['slicer', 'textSlicer', 'advancedSlicerVisual', 'listSlicer']);
const KPI_TYPES = new Set(['card', 'cardVisual', 'kpi']);
const KPI_MIN = 4, KPI_MAX = 6; // số thẻ KPI "chỉ số tổng quan" mỗi trang
const TIME_ASC = (e) => e && /^calendar$/i.test(e.table);
const CHART_FAMILIES = [
  new Set(['clusteredColumnChart', 'clusteredBarChart', 'stackedColumnChart', 'stackedBarChart', 'lineChart', 'areaChart']),
  new Set(['pieChart', 'donutChart']),
];
const clone = (o) => JSON.parse(JSON.stringify(o));

/** model: { tables: Map<lower, {name, columns: Map<lower, name>}>, measures: Map<lower, {name, table}> } */
function makeModel(tables, measures) {
  const T = new Map(tables.map((t) => [t.name.toLowerCase(), { name: t.name, columns: new Map(t.columns.map((c) => [c.toLowerCase(), c])) }]));
  const M = new Map(measures.map((m) => [m.name.toLowerCase(), { name: m.name, table: m.table }]));
  return { tables: T, measures: M };
}
const colRef = (model, table, column) => { const t = model.tables.get(String(table).toLowerCase()); const c = t && t.columns.get(String(column).toLowerCase()); return c ? { table: t.name, column: c } : null; };
const msrRef = (model, name) => model.measures.get(String(name).toLowerCase()) || null;

// một nút có tham chiếu "treo" (trường không có trong mô hình của người dùng)?
function hasDangling(node, model) {
  if (Array.isArray(node)) return node.some((x) => hasDangling(x, model));
  if (!node || typeof node !== 'object') return false;
  if (node.Hierarchy || node.HierarchyLevel || node.PropertyVariationSource) return true;
  for (const k of ['Column', 'Measure']) {
    if (node[k] && typeof node[k] === 'object') {
      const x = node[k], ent = x.Expression && x.Expression.SourceRef && x.Expression.SourceRef.Entity, prop = x.Property;
      if (!ent || !prop) return true;
      return k === 'Measure' ? !(msrRef(model, prop) && ieq(msrRef(model, prop).table, ent)) : !colRef(model, ent, prop);
    }
  }
  if (node.Aggregation) return true;
  return Object.values(node).some((x) => hasDangling(x, model));
}
function scrubProps(props, model) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (/^(labelDisplayUnits|displayUnits|valuesDisplayUnits)$/i.test(k)) { out[k] = { expr: { Literal: { Value: '0D' } } }; continue; } // đơn vị hiển thị của template gắn với số liệu của nó → tự động
    if (hasDangling(v, model)) continue;
    out[k] = v;
  }
  return out;
}
/** Chỉnh `objects` của biểu đồ sau khi gắn lại dữ liệu: đổi selector.metadata theo queryRef mới, bỏ định dạng gắn với trường cũ */
function adaptObjects(objects, refMap, model) {
  if (!objects) return objects;
  const out = {};
  for (const [name, items] of Object.entries(objects)) {
    const kept = [];
    for (const it of items) {
      const sel = it.selector ? clone(it.selector) : null;
      if (sel && sel.metadata !== undefined) {
        if (!refMap.has(sel.metadata)) continue;       // định dạng của series không còn tồn tại
        sel.metadata = refMap.get(sel.metadata);
      }
      if (sel && sel.data && hasDangling(sel.data, model)) continue;
      const props = scrubProps(it.properties, model);
      if (!Object.keys(props).length && !(sel && Object.keys(sel).length)) continue;
      if (!Object.keys(props).length) continue;
      kept.push(sel ? { ...it, properties: props, selector: sel } : { ...it, properties: props });
    }
    if (kept.length) out[name] = kept;
  }
  return out;
}

function bboxOverlap(a, b) { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y; }

/**
 * opts: { template, spec, model, outReportDir, userColors?:[5 hex], warn(fn) }
 * spec: { pages:{keep:[tên hoặc số trang]}, bind:{key:{title,subtitle,reference,referenceTitle,roles:{Role:[field...]}}}, texts:{key:string}, drop:[key] }
 * field: "Tên measure" | {table,column}
 * return: { pages, visuals, bound, dropped, copiedResources, summary[] }
 */
function applyTemplate(opts) {
  const { template: t, model } = opts, spec = opts.spec || {}, warn = opts.warn || (() => {});
  const man = t.manifest, outDef = path.join(opts.outReportDir, 'definition'), srcDef = path.join(t.dir, 'definition');
  const bind = spec.bind || {}, texts = spec.texts || {}, dropSet = new Set(spec.drop || []);
  // --- chọn trang
  const keepRaw = spec.pages && Array.isArray(spec.pages.keep) ? spec.pages.keep.map(String) : null;
  const isKept = (p) => (keepRaw ? keepRaw.some((k) => String(p.no) === k || ieq(p.name, k) || p.id === k) : !p.tooltip);
  let pagesKept = man.pages.filter(isKept);
  // trang tooltip chỉ giữ khi có biểu đồ gắn dữ liệu trong đó
  pagesKept = pagesKept.filter((p) => !p.tooltip || p.visuals.some((v) => bind[v.key]));
  if (!pagesKept.length) pagesKept = man.pages.filter((p) => !p.tooltip).slice(0, 1);
  const keptIds = new Set(pagesKept.map((p) => p.id));
  const tooltipKept = new Set(pagesKept.filter((p) => p.tooltip).map((p) => p.id));
  // --- "instance" trang: mỗi trang giữ lại là 1 instance; spec.pages.clones nhân bản một trang template thành nhiều trang
  //     (template chỉ có 1 trang nhưng cần nhiều trang để phân tích đủ). Khóa gắn dữ liệu của bản clone: "<cloneId>:<key>".
  const pageMatch = (p, k) => String(p.no) === String(k) || ieq(p.name, k) || p.id === k;
  const insts = pagesKept.map((pg) => ({ pg, cid: '', pid: pg.id, name: null }));
  const usedCid = new Set();
  (spec.pages && Array.isArray(spec.pages.clones) ? spec.pages.clones : []).forEach((c, n) => {
    const src = man.pages.find((p) => !p.tooltip && pageMatch(p, c.from));
    if (!src) { warn(`Nhân bản trang: không tìm thấy trang nguồn "${c.from}"`); return; }
    let cid = String(c.id || 'c' + (n + 1)).replace(/[^\w-]/g, '') || 'c' + (n + 1); while (usedCid.has(cid)) cid += 'x'; usedCid.add(cid);
    const inst = { pg: src, cid, pid: crypto.createHash('md5').update(src.id + ':' + cid).digest('hex').slice(0, 20), name: c.name ? String(c.name) : null };
    let at = -1; insts.forEach((x, i) => { if (x.pg.id === src.id) at = i; });
    insts.splice(at >= 0 ? at + 1 : insts.length, 0, inst);
  });
  if (spec.pages && Array.isArray(spec.pages.order)) {   // thứ tự trang tùy chọn (số trang / tên / id / id bản clone)
    const rank = (x) => { const i = spec.pages.order.findIndex((k) => (x.cid ? String(k) === x.cid : pageMatch(x.pg, k))); return i < 0 ? 1e6 : i; };
    insts.sort((a, b) => rank(a) - rank(b));    // sắp ổn định: trang không nêu giữ thứ tự cũ ở cuối
  }
  const renames = (spec.pages && spec.pages.rename) || {};
  for (const x of insts) {
    if (!x.name) { const k = Object.keys(renames).find((kk) => pageMatch(x.pg, kk)); x.name = k && !x.cid ? String(renames[k]) : null; }
  }
  const summary = []; let bound = 0, dropped = 0, visualsOut = 0;
  const neededResources = new Set();
  const collectRes = (node) => { if (Array.isArray(node)) node.forEach(collectRes); else if (node && typeof node === 'object') { if (node.ResourcePackageItem && node.ResourcePackageItem.ItemName) neededResources.add(node.ResourcePackageItem.ItemName); Object.values(node).forEach(collectRes); } };

  fs.rmSync(opts.outReportDir, { recursive: true, force: true });
  const wj = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8'); };

  for (const inst of insts) {
    const pg = inst.pg, cid = inst.cid, K = (m) => (cid ? cid + ':' + m.key : m.key);
    const pj = readJson(path.join(srcDef, 'pages', pg.id, 'page.json'));
    const pageName = inst.name || pj.displayName;
    const vis = readVisuals(t.dir, pg.id);
    const byKey = new Map(pg.visuals.map((m) => [m.name, m]));
    const decisions = new Map(); // name → 'keep' | 'drop'
    // 1) biểu đồ dữ liệu: gắn hoặc bỏ
    const rebuilt = new Map();
    for (const { json: v } of vis) {
      const m = byKey.get(v.name); if (!m) continue;
      if (dropSet.has(K(m))) { decisions.set(v.name, 'drop'); continue; }
      if (m.kind === 'data') {
        const b = bind[K(m)];
        const r = b ? rebind(v, m, b, model, warn) : null;
        if (r) { rebuilt.set(v.name, r); decisions.set(v.name, 'keep'); bound++; summary.push(`${K(m)} ${r.visual.visualType} ← ${r.__summary}`); } else { decisions.set(v.name, 'drop'); dropped++; if (b) warn(`${K(m)} (${m.type}): không gắn được dữ liệu → bỏ`); }
      }
    }
    // 1a) QUY TẮC: mỗi trang chỉ 4–6 thẻ KPI tổng quan — hơn 6 thì cấu trúc trình bày bị vỡ → cắt phần dư (theo thứ tự đọc: trên→dưới, trái→phải)
    {
      const kpiSlots = pg.visuals.filter((m) => m.kind === 'data' && KPI_TYPES.has(m.type));
      const kept = kpiSlots.filter((m) => decisions.get(m.name) === 'keep');
      if (kept.length > KPI_MAX) {
        for (const m of kept.slice(KPI_MAX)) { decisions.set(m.name, 'drop'); rebuilt.delete(m.name); bound--; dropped++; }
        warn(`Trang "${pageName}": gắn ${kept.length} thẻ KPI, vượt quy tắc tối đa ${KPI_MAX} → chỉ giữ ${KPI_MAX} thẻ đầu theo thứ tự đọc, bỏ ${kept.length - KPI_MAX} thẻ còn lại`);
      } else if (kept.length && kept.length < KPI_MIN && kpiSlots.length >= KPI_MIN) warn(`Trang "${pageName}": chỉ có ${kept.length} thẻ KPI tổng quan (nên ${KPI_MIN}–${KPI_MAX})`);
    }
    // 1b) nút / biểu tượng chuyển trang mà trang đích đã bị bỏ → bỏ theo
    for (const m of pg.visuals) if (m.kind === 'decor' && m.link === 'PageNavigation' && m.linkTo && !keptIds.has(m.linkTo) && decisions.get(m.name) !== 'drop') { decisions.set(m.name, 'drop'); dropped++; }
    // 2) shape/ảnh nền phía sau biểu đồ dữ liệu đã bỏ → bỏ theo (nếu mọi biểu đồ dữ liệu nó đỡ đều đã bỏ)
    const dataMetas = pg.visuals.filter((m) => m.kind === 'data');
    for (const m of pg.visuals.filter((x) => x.kind === 'decor' && (x.type === 'shape' || x.type === 'basicShape'))) {
      if (decisions.get(m.name) === 'drop') continue;
      const backed = dataMetas.filter((d) => bboxOverlap(m, d) >= 0.6 * d.w * d.h && m.z <= d.z);
      if (backed.length && backed.every((d) => decisions.get(d.name) === 'drop')) { decisions.set(m.name, 'drop'); dropped++; }
    }
    // 3) nhóm rỗng
    const groups = pg.visuals.filter((m) => m.kind === 'group');
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of groups) {
        if (decisions.get(g.name) === 'drop') continue;
        const kids = pg.visuals.filter((x) => x.parent === g.name);
        if (kids.length && kids.every((k) => decisions.get(k.name) === 'drop')) { decisions.set(g.name, 'drop'); changed = true; dropped++; }
      }
    }
    // 4) ghi trang
    const pageOut = clone(pj);
    pageOut.name = inst.pid; if (inst.name) pageOut.displayName = inst.name;
    delete pageOut.filterConfig; delete pageOut.pageBinding;
    if (pageOut.visualInteractions) { pageOut.visualInteractions = pageOut.visualInteractions.filter((i) => vis.some((x) => x.json.name === i.source && decisions.get(x.json.name) !== 'drop') && vis.some((x) => x.json.name === i.target && decisions.get(x.json.name) !== 'drop')); if (!pageOut.visualInteractions.length) delete pageOut.visualInteractions; }
    if (pageOut.objects) pageOut.objects = scrubObjectsDeep(pageOut.objects, model);
    collectRes(pageOut.objects);
    wj(path.join(outDef, 'pages', inst.pid, 'page.json'), pageOut);
    for (const { json: v0 } of vis) {
      if (decisions.get(v0.name) === 'drop') continue;
      const m = byKey.get(v0.name);
      let v = rebuilt.get(v0.name) || clone(v0);
      delete v.__summary;
      delete v.filterConfig;
      if (m.kind === 'text' && texts[K(m)] !== undefined) v = setText(v, String(texts[K(m)]));
      if (v.visual) {
        const vco = v.visual.visualContainerObjects;
        if (vco) {
          // bookmark không được copy → bỏ liên kết bookmark; chuyển trang chỉ giữ nếu trang đích còn
          if (vco.visualLink) vco.visualLink = vco.visualLink.filter((l) => { const ty = litStr(l.properties && l.properties.type); if (ty === 'Bookmark') return false; if (ty === 'PageNavigation') { const to = litStr(l.properties.navigationSection); return keptIds.has(to); } return true; });
          if (vco.visualLink && !vco.visualLink.length) delete vco.visualLink;
          if (vco.visualTooltip) vco.visualTooltip = vco.visualTooltip.filter((l) => tooltipKept.has(litStr(l.properties && l.properties.section)));
          if (vco.visualTooltip && !vco.visualTooltip.length) delete vco.visualTooltip;
        }
        if (v.visual.objects && !rebuilt.has(v0.name)) v.visual.objects = scrubObjectsDeep(v.visual.objects, model);
        if (v.visual.visualContainerObjects && !rebuilt.has(v0.name)) v.visual.visualContainerObjects = scrubObjectsDeep(v.visual.visualContainerObjects, model, true);
        if (v.visual.query && v.visual.query.queryState && !rebuilt.has(v0.name) && hasDangling(v.visual.query, model)) { continue; } // biểu đồ dữ liệu bị bỏ sót → không giữ lại
      }
      if (v.parentGroupName && decisions.get(v.parentGroupName) === 'drop') delete v.parentGroupName;
      collectRes(v);
      wj(path.join(outDef, 'pages', inst.pid, 'visuals', v.name, 'visual.json'), v); visualsOut++;
    }
  }
  // --- pages.json, version.json, report.json
  const pagesJ = readJson(path.join(srcDef, 'pages', 'pages.json'));
  pagesJ.pageOrder = insts.map((x) => x.pid);
  pagesJ.activePageName = pagesJ.pageOrder[0];
  delete pagesJ.landingPageName;
  wj(path.join(outDef, 'pages', 'pages.json'), pagesJ);
  fs.copyFileSync(path.join(srcDef, 'version.json'), (fs.mkdirSync(outDef, { recursive: true }), path.join(outDef, 'version.json')));
  const rep = readJson(path.join(srcDef, 'report.json'));
  delete rep.filterConfig; delete rep.publicCustomVisuals; delete rep.organizationCustomVisuals; delete rep.dataSourceVariables; delete rep.slowDataSourceSettings;
  if (rep.objects) rep.objects = scrubObjectsDeep(rep.objects, model);
  // --- tài nguyên: chỉ copy file được dùng
  const regDir = path.join(t.dir, 'StaticResources', 'RegisteredResources'), shDir = path.join(t.dir, 'StaticResources', 'SharedResources');
  const ct = rep.themeCollection && rep.themeCollection.customTheme; if (ct) neededResources.add(ct.name);
  const copied = [];
  const outStatic = path.join(opts.outReportDir, 'StaticResources');
  for (const name of neededResources) {
    const src = path.join(regDir, name);
    if (fs.existsSync(src)) { fs.mkdirSync(path.join(outStatic, 'RegisteredResources'), { recursive: true }); fs.copyFileSync(src, path.join(outStatic, 'RegisteredResources', name)); copied.push(name); }
  }
  if (fs.existsSync(shDir)) fs.cpSync(shDir, path.join(outStatic, 'SharedResources'), { recursive: true });
  if (rep.resourcePackages) {
    rep.resourcePackages = rep.resourcePackages.map((p) => ({ ...p, items: p.items.filter((i) => (p.type === 'RegisteredResources' ? copied.includes(i.path) : fs.existsSync(path.join(shDir, i.path)))) })).filter((p) => p.items.length);
  }
  // --- theme: dùng 5 màu của người dùng nếu được yêu cầu
  if (opts.userColors && opts.userColors.length === 5 && ct) {
    const tp = path.join(outStatic, 'RegisteredResources', ct.name);
    if (fs.existsSync(tp)) { const tj = readJson(tp); const old = Array.isArray(tj.dataColors) ? tj.dataColors : []; tj.dataColors = [...opts.userColors, ...old.slice(5)]; wj(tp, tj); summary.push('theme: dùng 5 màu của người dùng cho dataColors'); }
  }
  wj(path.join(outDef, 'report.json'), rep);
  return { pages: insts.length, clones: insts.filter((x) => x.cid).length, visuals: visualsOut, bound, dropped, resources: copied.length, summary, pageNames: insts.map((x) => x.name || x.pg.name) };
}

function scrubObjectsDeep(objects, model, containerObjects) {
  const out = {};
  for (const [name, items] of Object.entries(objects)) {
    if (!Array.isArray(items)) { out[name] = items; continue; }
    const kept = [];
    for (const it of items) {
      if (it.selector && it.selector.data && hasDangling(it.selector.data, model)) continue;
      const props = scrubProps(it.properties, model);
      if (it.properties && Object.keys(it.properties).length && !Object.keys(props).length) continue;
      kept.push({ ...it, properties: props });
    }
    if (kept.length) out[name] = kept;
  }
  return out;
}

function setText(v, text) {
  const objs = v.visual && v.visual.objects && v.visual.objects.general && v.visual.objects.general[0];
  if (!objs || !objs.properties) return v;
  const old = objs.properties.paragraphs || [];
  const lines = text.split('\n');
  const firstRun = (i) => { const p = old[i] || old[0] || {}; const r = (p.textRuns && p.textRuns[0]) || { textStyle: {} }; return r; };
  objs.properties.paragraphs = lines.map((ln, i) => {
    const r = firstRun(i); const base = old[Math.min(i, old.length - 1)] || {};
    return { ...(base.horizontalTextAlignment ? { horizontalTextAlignment: base.horizontalTextAlignment } : {}), textRuns: [{ value: ln, ...(r.textStyle ? { textStyle: r.textStyle } : {}) }] };
  });
  return v;
}

/** gắn dữ liệu của người dùng vào một biểu đồ dữ liệu của template; trả về visual mới hoặc null */
function rebind(v0, m, b, model, warn) {
  const v = clone(v0); const q = v.visual.query; const oldState = q.queryState || {};
  const roles = b.roles || {};
  const newState = {}; const refMap = new Map(); const desc = [];
  let any = false;
  for (const [role, fields] of Object.entries(roles)) {
    if (!oldState[role]) { warn(`${m.key} (${m.type}): template không có vai trò "${role}" (có: ${Object.keys(oldState).join(', ')}) → bỏ vai trò này`); continue; }
    const projections = [];
    for (const f of Array.isArray(fields) ? fields : [fields]) {
      let proj = null;
      if (typeof f === 'string') { const ms = msrRef(model, f); if (ms) proj = { field: { Measure: { Expression: { SourceRef: { Entity: ms.table } }, Property: ms.name } }, queryRef: `${ms.table}.${ms.name}`, nativeQueryRef: ms.name }; else warn(`${m.key}: measure "${f}" không tồn tại`); }
      else if (f && f.table && f.column) { const c = colRef(model, f.table, f.column); if (c) proj = { field: { Column: { Expression: { SourceRef: { Entity: c.table } }, Property: c.column } }, queryRef: `${c.table}.${c.column}`, nativeQueryRef: c.column }; else warn(`${m.key}: cột ${f.table}.${f.column} không tồn tại`); }
      if (proj) projections.push(proj);
    }
    if (!projections.length) continue;
    if (FIELD_ROLES_DIM.has(role) || SLICERS.has(m.type)) projections[0].active = true;
    newState[role] = { projections }; any = true;
    const oldRefs = (oldState[role].projections || []).map((p) => p.queryRef);
    oldRefs.forEach((r, i) => { if (projections[i]) refMap.set(r, projections[i].queryRef); });
    desc.push(`${role}=${projections.map((p) => p.nativeQueryRef).join('+')}`);
  }
  if (!any) return null;
  const hasValueRole = Object.entries(newState).some(([r, s]) => s.projections.some((p) => p.field.Measure));
  if (!SLICERS.has(m.type) && !hasValueRole && m.type !== 'pivotTable' && m.type !== 'tableEx') { warn(`${m.key} (${m.type}): thiếu measure → bỏ`); return null; }
  q.queryState = newState;
  // đổi loại biểu đồ trong CÙNG họ (cột↔thanh↔đường↔vùng; tròn↔donut) — giữ nguyên vai trò dữ liệu và định dạng của template
  if (b.visualType && b.visualType !== m.type) {
    const fam = CHART_FAMILIES.find((f) => f.has(m.type));
    if (fam && fam.has(b.visualType)) { v.visual.visualType = b.visualType; desc.push(`type=${b.visualType}`); }
    else warn(`${m.key}: không đổi được ${m.type} → ${b.visualType} (chỉ đổi trong cùng họ: ${CHART_FAMILIES.map((f) => [...f].join('/')).join(' | ')}) → giữ ${m.type}`);
  }
  // sắp xếp mặc định (IBCS): danh mục phi thời gian giảm dần theo measure đầu; thời gian tăng dần
  delete q.sortDefinition; delete q.expansionStates; delete q.fieldParameters;
  const catRole = newState.Category || newState.Group;
  if (catRole) {
    const cat = catRole.projections[0], msr = Object.values(newState).flatMap((s) => s.projections).find((p) => p.field.Measure);
    const timeAxis = TIME_ASC({ table: cat.field.Column && cat.field.Column.Expression.SourceRef.Entity });
    const sf = timeAxis || !msr ? cat.field : msr.field;
    q.sortDefinition = { sort: [{ field: sf, direction: timeAxis || !msr ? 'Ascending' : 'Descending' }], isDefaultSort: true };
  }
  v.visual.objects = adaptObjects(v.visual.objects, refMap, model);
  // thẻ KPI: nhãn tham chiếu (vd. "Last Year: …") → đo lường delta của người dùng
  if (b.reference) {
    const rm = msrRef(model, b.reference);
    if (rm && v.visual.visualType === 'cardVisual') {
      const obj = v.visual.objects = v.visual.objects || {};
      const old0 = v0.visual.objects && v0.visual.objects.referenceLabel;
      const sel = old0 && old0[0] && old0[0].selector ? clone(old0[0].selector) : null;
      const dataRef = Object.values(newState)[0].projections[0].queryRef;
      const selector = sel ? { ...sel, metadata: dataRef } : { data: [{ dataViewWildcard: { matchingOption: 0 } }], metadata: dataRef, id: 'field-bie-ref', order: 0 };
      obj.referenceLabel = [{ properties: { value: { expr: { Measure: { Expression: { SourceRef: { Entity: rm.table } }, Property: rm.name } } } }, selector }];
      const ttl = old0 && v0.visual.objects.referenceLabelTitle && v0.visual.objects.referenceLabelTitle[0];
      if (ttl) obj.referenceLabelTitle = [{ properties: { ...scrubProps(ttl.properties, model), titleContentType: { expr: { Literal: { Value: "'custom'" } } }, titleText: { expr: { Literal: { Value: `'${String(b.referenceTitle || '').replace(/'/g, "''")}'` } } } }, selector: { ...(ttl.selector || {}), metadata: dataRef } }];
      desc.push(`ref=${rm.name}`);
    } else if (b.reference) warn(`${m.key}: reference chỉ dùng cho cardVisual có measure hợp lệ`);
  }
  // tiêu đề / phụ đề
  const vco = v.visual.visualContainerObjects = v.visual.visualContainerObjects || {};
  if (b.title !== undefined) vco.title = [{ properties: { ...(vco.title && vco.title[0] ? vco.title[0].properties : {}), show: { expr: { Literal: { Value: b.title ? 'true' : 'false' } } }, ...(b.title ? { text: { expr: { Literal: { Value: `'${String(b.title).replace(/'/g, "''")}'` } } } } : {}) } }];
  else if (vco.title && vco.title[0] && vco.title[0].properties && vco.title[0].properties.text) vco.title[0].properties = scrubProps(vco.title[0].properties, model);
  if (b.subtitle) vco.subTitle = [{ properties: { show: { expr: { Literal: { Value: 'true' } } }, text: { expr: { Literal: { Value: `'${String(b.subtitle).replace(/'/g, "''")}'` } } } } }];
  v.__summary = desc.join('; ');
  return v;
}

module.exports = { loadTemplateFile, resolveForRun, describe, findPbix, loadTemplate, listTemplates, previewImage, wireframeSvg, manifestMarkdown, applyTemplate, makeModel, slug, TEMPLATES };
