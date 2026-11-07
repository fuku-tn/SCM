'use strict';
/**
 * Thư viện thành phần (component library) bóc TỪ CÁC TEMPLATE của người dùng — chỉ gồm các loại biểu đồ
 * thật sự xuất hiện trong templates/ (không thêm loại nào khác).
 *
 *  extract(templateId)        → danh sách component đã chuẩn hóa (ràng buộc dữ liệu → "vai trò" có token)
 *  instantiate(comp, opts)    → visual.json hoàn chỉnh, gắn vào cột/measure thật (opts.fields)
 *  validateComponent(comp)    → kiểm tra cơ học (không còn tham chiếu cũ, gắn thử được, token đều được thay)
 *  buildLibrary(outDir)       → ghi component-library/{index.json, CATALOG.md, components/*.json}
 *
 * Token trong component:
 *   "@Role[i]"      vị trí trường thứ i của vai trò Role (thay bằng object trường khi gắn)
 *   "@ref:Role[i]"  queryRef (vd. "Bảng.Cột") của trường đó
 *   "@name:Role[i]" nativeQueryRef (tên hiển thị ngắn)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TPL = require('./pbix-template.js');

const FIELD_KEYS = ['Column', 'Measure', 'Aggregation', 'HierarchyLevel'];
const isField = (o) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === 1 && FIELD_KEYS.includes(Object.keys(o)[0]) && o[Object.keys(o)[0]] && typeof o[Object.keys(o)[0]] === 'object';
const clone = (x) => JSON.parse(JSON.stringify(x));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const AGG = { 0: 'Sum', 1: 'Avg', 2: 'Count', 3: 'Min', 4: 'Max', 5: 'CountNonNull', 6: 'Median', 7: 'StandardDeviation', 8: 'Variance' };
const AGG_LABEL = { Sum: 'Sum of', Avg: 'Average of', Count: 'Count of', Min: 'Min of', Max: 'Max of', CountNonNull: 'Count of', Median: 'Median of', StandardDeviation: 'Standard deviation of', Variance: 'Variance of' };
const TOKEN = /^@(?:(ref|name):)?([A-Za-z0-9_]+)\[(\d+)\]$/;

function kindOf(f) {
  const k = Object.keys(f)[0];
  if (k === 'Measure') return { kind: 'measure' };
  if (k === 'Column') return { kind: 'column' };
  if (k === 'Aggregation') { const inner = f.Aggregation.Expression || {}; return { kind: 'column', agg: f.Aggregation.Function, aggBase: Object.keys(inner)[0] === 'Measure' ? 'measure' : 'column' }; }
  return { kind: 'hierarchy' };
}
function hierKey(f) { // nhận diện cùng một hierarchy (khác Level)
  const h = f.HierarchyLevel; try { const hh = h.Expression.Hierarchy; return JSON.stringify([hh.Expression, hh.Hierarchy]); } catch { return JSON.stringify(f); }
}

// ------------------------------------------------------------------ chuẩn hóa một visual
function normalize(v) {
  const out = clone(v); const notes = { dropped: [], collapsed: 0, foreign: 0 };
  delete out.name; delete out.position; delete out.isHidden; delete out.parentGroupName; delete out.filterConfig;
  const vis = out.visual; const qs = (vis.query && vis.query.queryState) || {};
  const tokenByField = new Map(), tokenByRef = new Map(); const roles = {};
  for (const [role, st] of Object.entries(qs)) {
    const seenHier = new Set(); const keep = [];
    for (const p of st.projections || []) {
      const f = p.field; const ki = kindOf(f);
      if (ki.kind === 'hierarchy') { const hk = hierKey(f); if (seenHier.has(hk)) { notes.collapsed++; continue; } seenHier.add(hk); }
      keep.push(p);
    }
    st.projections = keep;
    roles[role] = keep.map((p, i) => {
      const f = p.field; const ki = kindOf(f); const tok = `${role}[${i}]`;
      tokenByField.set(JSON.stringify(f), tok); if (p.queryRef) tokenByRef.set(p.queryRef, tok);
      const slot = { kind: ki.kind };
      if (ki.agg !== undefined) { slot.agg = ki.agg; slot.aggBase = ki.aggBase; }
      if (p.displayName) slot.displayName = p.displayName;
      p.field = '@' + tok; if (p.queryRef) p.queryRef = '@ref:' + tok; if (p.nativeQueryRef) p.nativeQueryRef = '@name:' + tok;
      return slot;
    });
  }
  let propDepth = 0; const extraMap = new Map();
  // hierarchy rơi mất → các level còn lại của cùng hierarchy cũng map về token của level đầu (đã gom)
  const sub = (node) => {
    if (Array.isArray(node)) { const r = node.map(sub); return r.some((x) => x === undefined) ? undefined : r; }
    if (node && typeof node === 'object') {
      if (isField(node)) {
        const t = tokenByField.get(JSON.stringify(node)); if (t) return '@' + t;
        if (node.HierarchyLevel) { // level khác của hierarchy đã gom
          for (const [k, tk] of tokenByField) { try { const g = JSON.parse(k); if (g.HierarchyLevel && hierKey(g) === hierKey(node)) return '@' + tk; } catch {} }
        }
        // trường nằm trong định dạng (vd. referenceLabel.value = measure "YoY %" dưới số KPI) → slot phụ "Extra" gắn được
        if (propDepth > 0) {
          const key = JSON.stringify(node);
          if (!extraMap.has(key)) {
            const ki = kindOf(node); const arr = (roles.Extra = roles.Extra || []);
            const inner = node[Object.keys(node)[0]]; const hint = inner && (inner.Property || (inner.Expression && inner.Expression.Measure && inner.Expression.Measure.Property)) || '';
            arr.push({ kind: ki.kind, ...(ki.agg !== undefined ? { agg: ki.agg, aggBase: ki.aggBase } : {}), hint, extra: true });
            extraMap.set(key, `Extra[${arr.length - 1}]`);
          }
          return '@' + extraMap.get(key);
        }
        notes.foreign++; return undefined;
      }
      const o = {};
      for (const [k, val] of Object.entries(node)) {
        if (k === 'properties' && val && typeof val === 'object' && !Array.isArray(val)) {
          const props = {};
          for (const [pk, pv] of Object.entries(val)) { propDepth++; const r = sub(pv); propDepth--; if (r === undefined) { notes.dropped.push(pk); } else props[pk] = r; }
          o[k] = props; continue;
        }
        const r = sub(val); if (r === undefined) return undefined; o[k] = r;
      }
      return o;
    }
    if (typeof node === 'string' && tokenByRef.has(node)) return '@ref:' + tokenByRef.get(node);
    return node;
  };
  // tooltip trang / liên kết trang / bookmark trỏ tới trang của template gốc → không còn tồn tại khi tách rời
  if (vis.visualContainerObjects) for (const k of ['visualTooltip', 'visualLink']) if (vis.visualContainerObjects[k]) { delete vis.visualContainerObjects[k]; notes.dropped.push(k + ' (trỏ tới trang của template)'); }
  if (vis.objects) for (const k of ['visualTooltip', 'visualLink']) if (vis.objects[k]) { delete vis.objects[k]; notes.dropped.push(k); }
  // lựa chọn đã lưu của slicer (general.filter) gắn với giá trị dữ liệu cũ → luôn gỡ
  if (vis.objects && vis.objects.general) vis.objects.general.forEach((it) => { if (it.properties && it.properties.filter) { delete it.properties.filter; notes.dropped.push('general.filter (lựa chọn đã lưu)'); } });
  // objects / visualContainerObjects: mỗi phần tử (item) bỏ hẳn nếu selector tham chiếu ngoài
  for (const bag of ['objects']) {
    if (vis[bag]) for (const [name, items] of Object.entries(vis[bag])) {
      const kept = [];
      for (const it of items) { const r = sub(it); if (r === undefined) { notes.dropped.push(name + '[selector]'); continue; } kept.push(r); }
      if (kept.length) vis[bag][name] = kept; else delete vis[bag][name];
    }
  }
  if (vis.visualContainerObjects) for (const [name, items] of Object.entries(vis.visualContainerObjects)) {
    const kept = []; for (const it of items) { const r = sub(it); if (r === undefined) { notes.dropped.push(name + '[selector]'); continue; } kept.push(r); }
    if (kept.length) vis.visualContainerObjects[name] = kept; else delete vis.visualContainerObjects[name];
  }
  if (vis.query) {
    for (const k of Object.keys(vis.query)) if (k !== 'queryState') { const r = sub(vis.query[k]); if (r === undefined) delete vis.query[k]; else vis.query[k] = r; }
  }
  for (const k of Object.keys(vis)) if (!['visualType', 'query', 'objects', 'visualContainerObjects'].includes(k)) { const r = sub(vis[k]); if (r === undefined) delete vis[k]; else vis[k] = r; }
  return { visual: out, roles, notes };
}

// ------------------------------------------------------------------ gắn dữ liệu (instantiate)
function buildField(slot, b) {
  const ent = { Expression: { SourceRef: { Entity: b.table } } };
  if (slot.kind === 'measure' && slot.agg === undefined) return { Measure: { ...ent, Property: b.name } };
  const col = { Column: { ...ent, Property: b.name } };
  if (slot.agg !== undefined) return { Aggregation: { Expression: b.kind === 'measure' ? { Measure: { ...ent, Property: b.name } } : col, Function: slot.agg } };
  return col;
}
function refsOf(slot, b) {
  const base = `${b.table}.${b.name}`;
  if (slot.agg !== undefined) { const fn = AGG[slot.agg] || 'Sum'; return { ref: `${fn}(${base})`, name: `${AGG_LABEL[fn] || fn + ' of'} ${b.name}` }; }
  return { ref: base, name: b.name };
}
/** opts: { name, x, y, w, h, z, fields: { Role: [ {table, name, kind?} ... ] } } → visual.json hoặc null nếu không còn trường nào */
function instantiate(comp, opts) {
  const v = clone(comp.visual); const fields = opts.fields || {};
  const slots = comp.roles; const bound = new Map(); // token → {field, ref, name}
  for (const [role, arr] of Object.entries(slots)) arr.forEach((slot, i) => {
    const b = (fields[role] || [])[i]; if (!b) return;
    const r = refsOf(slot, b); bound.set(`${role}[${i}]`, { field: buildField(slot, b), ref: r.ref, name: r.name });
  });
  const res = (node, inProps) => {
    if (Array.isArray(node)) return node.map((x) => res(x)).filter((x) => x !== undefined);
    if (node && typeof node === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(node)) {
        if (k === 'properties' && val && typeof val === 'object' && !Array.isArray(val)) {
          const props = {}; for (const [pk, pv] of Object.entries(val)) { const r = res(pv); if (r !== undefined) props[pk] = r; } o[k] = props; continue;
        }
        const r = res(val); if (r === undefined) return undefined; o[k] = r;
      }
      return o;
    }
    if (typeof node === 'string') {
      const m = node.match(TOKEN); if (!m) return node;
      const b = bound.get(`${m[2]}[${m[3]}]`); if (!b) return undefined;
      return m[1] === 'ref' ? b.ref : m[1] === 'name' ? b.name : clone(b.field);
    }
    return node;
  };
  // projections: bỏ phần tử không gắn được
  const qs = v.visual.query.queryState;
  for (const [role, st] of Object.entries(qs)) {
    st.projections = st.projections.map((p) => res(p)).filter(Boolean);
    if (!st.projections.length) delete qs[role];
  }
  if (!Object.keys(qs).length) return null;
  for (const bag of ['objects', 'visualContainerObjects']) {
    if (!v.visual[bag]) continue;
    for (const [name, items] of Object.entries(v.visual[bag])) { const r = res(items); if (!r || !r.length) delete v.visual[bag][name]; else v.visual[bag][name] = r; }
  }
  for (const k of Object.keys(v.visual.query)) if (k !== 'queryState') { const r = res(v.visual.query[k]); if (r === undefined) delete v.visual.query[k]; else v.visual.query[k] = r; }
  for (const k of Object.keys(v.visual)) if (!['visualType', 'query', 'objects', 'visualContainerObjects'].includes(k)) { const r = res(v.visual[k]); if (r === undefined) delete v.visual[k]; else v.visual[k] = r; }
  const size = comp.size || {};
  return { $schema: v.$schema, name: opts.name, position: { x: opts.x ?? 0, y: opts.y ?? 0, z: opts.z ?? 0, height: opts.h ?? size.h, width: opts.w ?? size.w, tabOrder: opts.tabOrder ?? 0 }, ...Object.fromEntries(Object.entries(v).filter(([k]) => !['$schema'].includes(k))) };
}

// ------------------------------------------------------------------ trích từ template
function extract(templateId) {
  const t = TPL.loadTemplate(templateId); if (!t) throw new Error('Không có template ' + templateId);
  const comps = [];
  for (const page of t.manifest.pages) {
    if (page.tooltip) continue; // trang tooltip: không phải biểu đồ độc lập
    const vdir = path.join(t.dir, 'definition', 'pages', page.id, 'visuals');
    for (const item of page.visuals) {
      if (item.kind !== 'data') continue;
      const f = path.join(vdir, item.name, 'visual.json'); if (!fs.existsSync(f)) continue;
      const raw = readJson(f); if (!raw.visual || !raw.visual.query || !raw.visual.query.queryState) continue;
      const n = normalize(raw);
      const body = JSON.stringify(n.visual);
      const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 8);
      const title = item.title || null;
      comps.push({
        id: `${templateId}-p${page.no}-${raw.visual.visualType}-${item.name.slice(0, 6)}`,
        template: templateId, templateName: t.name, page: page.no, pageName: page.name,
        type: raw.visual.visualType, size: { w: Math.round(raw.position.width), h: Math.round(raw.position.height) },
        title, roles: n.roles, hash, notes: { droppedProperties: [...new Set(n.notes.dropped)], collapsedHierarchyLevels: n.notes.collapsed, foreignRefs: n.notes.foreign },
        visual: n.visual,
      });
    }
  }
  return comps;
}

// ------------------------------------------------------------------ kiểm tra một component
function validateComponent(comp) {
  const issues = [];
  const txt = JSON.stringify(comp.visual);
  if (/"Entity"\s*:/.test(txt)) issues.push('còn tham chiếu bảng cũ (Entity) trong component');
  // gắn thử với trường giả
  const fields = {};
  for (const [role, arr] of Object.entries(comp.roles)) fields[role] = arr.map((s, i) => ({ table: s.kind === 'measure' ? '_M' : 'Dim', name: (s.kind === 'measure' ? 'Measure' : 'Col') + role + i }));
  let inst; try { inst = instantiate(comp, { name: 'x'.repeat(20), fields }); } catch (e) { issues.push('gắn thử lỗi: ' + e.message); }
  if (!inst) issues.push('gắn thử không ra visual (không có trường nào gắn được)');
  else {
    const s = JSON.stringify(inst);
    const left = s.match(/"@(?:(?:ref|name):)?[A-Za-z0-9_]+\[\d+\]"/g); if (left) issues.push('token chưa thay: ' + [...new Set(left)].slice(0, 3).join(', '));
    if (!inst.visual.visualType) issues.push('thiếu visualType');
    const projCount = Object.values(inst.visual.query.queryState).reduce((n, st) => n + st.projections.length, 0);
    const slotCount = Object.entries(comp.roles).filter(([r]) => r !== 'Extra').reduce((n, [, a]) => n + a.length, 0);
    if (projCount !== slotCount) issues.push(`số trường sau khi gắn (${projCount}) ≠ số slot (${slotCount})`);
    // selector.metadata phải trỏ tới queryRef có thật
    const refs = new Set(); Object.values(inst.visual.query.queryState).forEach((st) => st.projections.forEach((p) => refs.add(p.queryRef)));
    const meta = [...s.matchAll(/"metadata":"([^"]+)"/g)].map((m) => m[1]); const bad = meta.filter((m) => !refs.has(m));
    if (bad.length) issues.push('selector.metadata trỏ tới trường không có: ' + [...new Set(bad)].slice(0, 2).join(', '));
  }
  return issues;
}

// ------------------------------------------------------------------ ghi thư viện
function buildLibrary(outDir) {
  const tpls = TPL.listTemplates();
  const all = []; const typesByTpl = {};
  for (const t of tpls) { const cs = extract(t.id); typesByTpl[t.id] = {}; cs.forEach((c) => { typesByTpl[t.id][c.type] = (typesByTpl[t.id][c.type] || 0) + 1; }); all.push(...cs); }
  fs.rmSync(path.join(outDir, 'components'), { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'components'), { recursive: true });
  // khử trùng lặp: cùng template + cùng hash (cùng loại, cùng định dạng, cùng vai trò) → giữ bản đầu
  const seen = new Map(); const kept = [];
  for (const c of all) { const k = c.template + ':' + c.hash; if (seen.has(k)) { seen.get(k).duplicates = (seen.get(k).duplicates || 0) + 1; continue; } seen.set(k, c); kept.push(c); }
  const index = [];
  for (const c of kept) {
    c.issues = validateComponent(c); c.status = c.issues.length ? 'FAIL' : 'PASS';
    fs.writeFileSync(path.join(outDir, 'components', c.id + '.json'), JSON.stringify(c, null, 2), 'utf8');
    index.push({ id: c.id, template: c.template, page: c.page, pageName: c.pageName, type: c.type, size: c.size, title: c.title, roles: Object.fromEntries(Object.entries(c.roles).map(([r, a]) => [r, a.map((s) => s.kind + (s.agg !== undefined ? ':' + (AGG[s.agg] || s.agg) : ''))])), duplicates: c.duplicates || 0, droppedProperties: c.notes.droppedProperties, status: c.status, issues: c.issues, file: 'components/' + c.id + '.json' });
  }
  const summary = { generatedAt: new Date().toISOString(), templates: tpls.map((t) => ({ id: t.id, name: t.name })), chartTypesInTemplates: typesByTpl, total: index.length, pass: index.filter((c) => c.status === 'PASS').length, fail: index.filter((c) => c.status === 'FAIL').length };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ summary, components: index }, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'CATALOG.md'), catalogMarkdown(summary, index), 'utf8');
  return { summary, index };
}

function catalogMarkdown(summary, index) {
  const L = ['# Thư viện thành phần (bóc từ templates của người dùng)', '',
    `Tự sinh bởi \`node scripts/build-components.js\` · ${summary.total} mẫu (${summary.pass} PASS, ${summary.fail} FAIL) · chỉ gồm các loại biểu đồ có thật trong templates.`, '',
    'PASS = kiểm tra cơ học (không còn tham chiếu cũ, gắn thử được, token thay hết). **Chưa phải “đã mở được trong Power BI Desktop”** — việc đó cần mở `gallery` và xác nhận.', '', '## Loại biểu đồ có trong từng template', ''];
  for (const t of summary.templates) L.push(`- **${t.name}**: ${Object.entries(summary.chartTypesInTemplates[t.id]).map(([k, n]) => `${k}×${n}`).join(', ')}`);
  L.push('', '## Danh sách mẫu', '', '| Loại | Mẫu | Template · Trang | Kích thước | Vai trò (trường cần gắn) | Trạng thái |', '|---|---|---|---|---|---|');
  const sorted = index.slice().sort((a, b) => a.type.localeCompare(b.type) || a.template.localeCompare(b.template) || a.page - b.page);
  for (const c of sorted) L.push(`| ${c.type} | \`${c.id}\`${c.duplicates ? ` (+${c.duplicates} bản giống)` : ''} | ${c.template} · ${c.page}. ${c.pageName} | ${c.size.w}×${c.size.h} | ${Object.entries(c.roles).map(([r, a]) => `${r}: ${a.join(', ')}`).join('; ')} | ${c.status === 'PASS' ? '✅' : '❌ ' + c.issues.join('; ')} |`);
  return L.join('\n') + '\n';
}

module.exports = { extract, normalize, instantiate, validateComponent, buildLibrary, catalogMarkdown };
