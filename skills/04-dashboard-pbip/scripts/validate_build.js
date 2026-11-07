#!/usr/bin/env node
/**
 * Kiểm tra CƠ HỌC một project PBIP đã dựng (không cần mạng, không cần model).
 *
 *   node validate_build.js <thư mục project PBIP>      (thư mục chứa file .pbip)
 *
 * Exit 0: không có lỗi HARD · 1: có ≥1 lỗi HARD. WARN chỉ cảnh báo.
 * Mỗi mục dưới đây tương ứng một lớp lỗi làm Power BI Desktop không mở được, mở ra trang trắng hoặc nạp 0 dòng.
 * Dùng được như module:  const { validateBuild } = require('./validate_build.js')
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KPI_TYPES = new Set(['card', 'cardVisual', 'kpi']);
const KPI_MAX = 6, KPI_MIN = 4;

const walkFiles = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const readText = (p) => fs.readFileSync(p, 'utf8');
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');

// ---- đọc tên TMDL (có thể đặt trong '…') ----
function tmdlName(s) {
  s = s.trim();
  if (s[0] === "'") { let out = '', i = 1; for (; i < s.length; i++) { if (s[i] === "'") { if (s[i + 1] === "'") { out += "'"; i++; } else break; } else out += s[i]; } return { name: out, rest: s.slice(i + 1) }; }
  const m = s.match(/^[^\s=:]+/); return { name: m ? m[0] : '', rest: s.slice(m ? m[0].length : 0) };
}
function parseTable(txt) {
  const lines = txt.replace(/\r/g, '').split('\n'); const t = { name: '', columns: new Map(), measures: new Map(), hasPartition: false, partitions: [] };
  let cur = null;
  for (const ln of lines) {
    let m;
    if ((m = ln.match(/^table\s+(.*)$/))) t.name = tmdlName(m[1]).name;
    else if ((m = ln.match(/^\tcolumn\s+(.*)$/))) { const n = tmdlName(m[1]).name; cur = { name: n, type: null }; t.columns.set(n.toLowerCase(), cur); }
    else if ((m = ln.match(/^\tmeasure\s+(.*)$/))) { const r = tmdlName(m[1]); const eq = r.rest.indexOf('='); t.measures.set(r.name.toLowerCase(), { name: r.name, expr: eq >= 0 ? r.rest.slice(eq + 1).trim() : '' }); cur = null; }
    else if ((m = ln.match(/^\tpartition\s+(.*)$/))) { t.hasPartition = true; t.partitions.push({ name: tmdlName(m[1]).name, text: '' }); cur = null; }
    else if ((m = ln.match(/^\t\tdataType:\s*(\S+)/)) && cur) cur.type = m[1];
    if (t.partitions.length && /^\t\t/.test(ln)) t.partitions[t.partitions.length - 1].text += ln + '\n';
  }
  return t;
}

function validateBuild(projectDir) {
  const hard = [], warn = [], notes = [];
  const H = (m) => hard.push(m), W = (m) => warn.push(m);
  let checks = 0; const ok = (c, msg, level = 'H') => { checks++; if (!c) (level === 'H' ? H : W)(msg); return !!c; };
  const root = path.resolve(projectDir);
  const pbip = fs.readdirSync(root).find((f) => /\.pbip$/i.test(f));
  if (!ok(!!pbip, 'Không có file .pbip ở thư mục gốc project')) return { hard, warn, checks, notes };
  const name = pbip.replace(/\.pbip$/i, '');
  const repDir = path.join(root, name + '.Report'), smDir = path.join(root, name + '.SemanticModel');
  ok(fs.existsSync(repDir), `Thiếu thư mục ${name}.Report`); ok(fs.existsSync(smDir), `Thiếu thư mục ${name}.SemanticModel`);
  if (!fs.existsSync(repDir) || !fs.existsSync(smDir)) return { hard, warn, checks, notes };

  // ---- 1. file: BOM, JSON hợp lệ, placeholder, model.bim ----
  const all = walkFiles(root);
  ok(!all.some((f) => /model\.bim$/i.test(f)), 'Có model.bim cạnh TMDL — Power BI Desktop từ chối mở khi có cả hai định dạng');
  for (const f of all) {
    if (!/\.(json|tmdl|pbip|pbir|pbism)$/i.test(f)) continue;
    const buf = fs.readFileSync(f);
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) H(`BOM UTF-8 trong ${rel(root, f)} (Desktop yêu cầu UTF-8 không BOM)`);
    const txt = buf.toString('utf8'); checks++;
    if (/\.(json|pbip|pbir|pbism)$/i.test(f)) { try { JSON.parse(txt); } catch (e) { H(`JSON lỗi: ${rel(root, f)} — ${e.message}`); } }
    if (/\b(TODO|FIXME|XXX)\b|<fill in>|\{\{[A-Z_]+\}\}/.test(txt) && !/StaticResources/.test(f)) H(`Còn placeholder (TODO/FIXME/{{…}}) trong ${rel(root, f)}`);
  }

  // ---- 2. pbir / pbism / version / pages ----
  const jp = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
  const pbir = jp(path.join(repDir, 'definition.pbir'));
  if (ok(!!pbir, 'Thiếu / hỏng definition.pbir')) {
    ok(pbir.version, 'definition.pbir thiếu "version"');
    const bp = pbir.datasetReference && pbir.datasetReference.byPath && pbir.datasetReference.byPath.path;
    ok(!!bp && fs.existsSync(path.resolve(repDir, bp)), `definition.pbir trỏ tới semantic model không tồn tại (${bp})`);
    if (pbir.version && parseFloat(pbir.version) < 4) ok(fs.existsSync(path.join(repDir, 'report.json')), 'definition.pbir version < 4.0 nhưng không có report.json');
  }
  const pbism = jp(path.join(smDir, 'definition.pbism'));
  if (ok(!!pbism, 'Thiếu / hỏng definition.pbism')) ok(pbism.version && parseFloat(pbism.version) >= 4, 'definition.pbism phải version ≥ 4.0 để dùng TMDL');
  const ver = jp(path.join(repDir, 'definition', 'version.json'));
  if (ok(!!ver, 'Thiếu definition/version.json — báo cáo mở ra trang trắng')) ok(/^\d+\.\d+\.\d+$/.test(String(ver.version)), 'version.json có version không hợp lệ');
  if (ver) ok(parseFloat(ver.version) >= 2, `version.json = "${ver.version}": phiên bản 1.x có thể mở ra trang trắng không báo lỗi (cần 2.0.0)`);
  const rep = jp(path.join(repDir, 'definition', 'report.json')); ok(!!rep, 'Thiếu definition/report.json');
  const pagesJ = jp(path.join(repDir, 'definition', 'pages', 'pages.json'));
  if (!ok(!!pagesJ, 'Thiếu definition/pages/pages.json')) return { hard, warn, checks, notes };
  if (pagesJ.$schema && /pagesMetadata\/2\./.test(pagesJ.$schema)) W('pages.json dùng pagesMetadata 2.x — có thể hiện cảnh báo "bản mới hơn" trên một số bản Desktop');
  ok((pagesJ.pageOrder || []).length > 0, 'pages.json không có trang nào');
  ok((pagesJ.pageOrder || []).includes(pagesJ.activePageName), 'activePageName không nằm trong pageOrder');
  const pagesDir = path.join(repDir, 'definition', 'pages');
  const dirs = fs.readdirSync(pagesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const p of pagesJ.pageOrder || []) ok(dirs.includes(p), `pageOrder có "${p}" nhưng không có thư mục trang`);
  for (const d of dirs) if (!(pagesJ.pageOrder || []).includes(d)) W(`Thư mục trang "${d}" không có trong pageOrder (trang mồ côi)`);

  // ---- 3. mô hình ngữ nghĩa ----
  const defDir = path.join(smDir, 'definition');
  ok(fs.existsSync(path.join(defDir, 'model.tmdl')), 'Thiếu definition/model.tmdl');
  ok(fs.existsSync(path.join(defDir, 'database.tmdl')), 'Thiếu definition/database.tmdl', 'W');
  const tables = new Map();
  const tdir = path.join(defDir, 'tables');
  for (const f of fs.existsSync(tdir) ? fs.readdirSync(tdir) : []) {
    const txt = readText(path.join(tdir, f)); const t = parseTable(txt);
    if (!ok(!!t.name, `tables/${f}: không có khai báo "table"`)) continue;
    if (/^ +\S/m.test(txt.replace(/\r/g, ''))) H(`tables/${f}: thụt lề bằng dấu cách (TMDL cần tab)`);
    ok(t.hasPartition, `Bảng "${t.name}" không có partition — Desktop đọc như nguồn "entity" và báo lỗi composite model`);
    tables.set(t.name.toLowerCase(), t);
  }
  const modelTxt = fs.existsSync(path.join(defDir, 'model.tmdl')) ? readText(path.join(defDir, 'model.tmdl')) : '';
  for (const m of modelTxt.matchAll(/^ref table\s+(.*)$/gm)) { const n = tmdlName(m[1]).name; ok(tables.has(n.toLowerCase()), `model.tmdl có "ref table ${n}" nhưng không có file bảng`); }
  for (const t of tables.values()) if (!new RegExp('^ref table\\s+\'?' + t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\'?\\s*$', 'm').test(modelTxt)) W(`Bảng "${t.name}" chưa được "ref table" trong model.tmdl`);

  // DataFolder + đường dẫn CSV
  const exprTxt = fs.existsSync(path.join(defDir, 'expressions.tmdl')) ? readText(path.join(defDir, 'expressions.tmdl')) : '';
  const dfm = exprTxt.match(/expression\s+DataFolder\s*=\s*"([^"]*)"/);
  let dataFolder = null;
  if (/File\.Contents\(DataFolder/.test([...tables.values()].map((t) => t.partitions.map((p) => p.text).join('')).join(''))) {
    if (ok(!!dfm, 'Có partition dùng DataFolder nhưng thiếu tham số DataFolder trong expressions.tmdl')) {
      dataFolder = dfm[1].replace(/""/g, '"');
      ok(fs.existsSync(dataFolder), `Tham số DataFolder trỏ tới thư mục không tồn tại: ${dataFolder} — báo cáo sẽ mở ra nhưng nạp 0 dòng`);
      if (fs.existsSync(dataFolder)) for (const t of tables.values()) for (const p of t.partitions) { const m = p.text.match(/File\.Contents\(DataFolder\s*&\s*"([^"]+)"\)/); if (m) ok(fs.existsSync(path.join(dataFolder, m[1].replace(/^[\\/]/, ''))), `File dữ liệu của bảng "${t.name}" không có trong DataFolder: ${m[1]}`); }
      const inside = dataFolder && path.resolve(dataFolder).toLowerCase().startsWith(root.toLowerCase());
      if (!inside) W('DataFolder nằm ngoài thư mục project — chuyển project sang máy khác sẽ phải đặt lại tham số (dùng SetDataFolder.ps1)');
    }
  }
  // measure: tham chiếu hợp lệ
  const measureNames = new Set([...tables.values()].flatMap((t) => [...t.measures.keys()]));
  for (const t of tables.values()) for (const m of t.measures.values()) {
    const noCols = m.expr.replace(/'(?:[^']|'')+'\[[^\]]+\]/g, (x) => { const mm = x.match(/^'((?:[^']|'')+)'\[([^\]]+)\]$/); const tn = mm[1].replace(/''/g, "'").toLowerCase(), cn = mm[2].toLowerCase(); const tt = tables.get(tn); if (!tt) H(`Measure "${m.name}" tham chiếu bảng không tồn tại: ${mm[1]}`); else if (!tt.columns.has(cn) && !tt.measures.has(cn)) H(`Measure "${m.name}" tham chiếu cột không tồn tại: ${mm[1]}[${mm[2]}]`); checks++; return ''; });
    for (const r of noCols.matchAll(/\[([^\]]+)\]/g)) { checks++; if (!measureNames.has(r[1].toLowerCase())) H(`Measure "${m.name}" tham chiếu measure không tồn tại: [${r[1]}]`); }
  }
  // quan hệ
  const relTxt = fs.existsSync(path.join(defDir, 'relationships.tmdl')) ? readText(path.join(defDir, 'relationships.tmdl')) : '';
  // "Bảng.Cột" — mỗi vế có thể đặt trong '…'; vế không nháy kết thúc ở dấu chấm
  const seg = (s) => { s = s.trim(); if (s[0] === "'") return tmdlName(s); const m = s.match(/^[^.\s]+/); return { name: m ? m[0] : '', rest: s.slice(m ? m[0].length : 0) }; };
  const colRef = (s) => { const a = seg(s); const b = seg(a.rest.replace(/^\./, '')); return { table: a.name, column: b.name }; };
  for (const blk of relTxt.replace(/\r/g, '').split(/\n(?=relationship\s)/)) {
    const f = blk.match(/fromColumn:\s*(.+)/), t = blk.match(/toColumn:\s*(.+)/); if (!f || !t) continue;
    const a = colRef(f[1]), b = colRef(t[1]); const ta = tables.get(a.table.toLowerCase()), tb = tables.get(b.table.toLowerCase());
    const ca = ta && ta.columns.get(a.column.toLowerCase()), cb = tb && tb.columns.get(b.column.toLowerCase());
    if (!ok(!!ca && !!cb, `Quan hệ ${a.table}.${a.column} → ${b.table}.${b.column}: bảng/cột không tồn tại`)) continue;
    ok(ca.type === cb.type, `Quan hệ ${a.table}.${a.column} (${ca.type}) → ${b.table}.${b.column} (${cb.type}): khác kiểu dữ liệu`);
  }

  // ---- 4. báo cáo: trang, visual, trường dữ liệu ----
  const resItems = new Set((rep && rep.resourcePackages ? rep.resourcePackages : []).flatMap((p) => p.items.map((i) => ({ p, i }))).map((x) => { const base = x.p.type === 'RegisteredResources' ? 'RegisteredResources' : 'SharedResources'; return base + '/' + x.i.path; }));
  for (const r of resItems) ok(fs.existsSync(path.join(repDir, 'StaticResources', r)), `resourcePackages trỏ tới file không có: StaticResources/${r}`);
  const refsOf = (node, out = []) => { if (Array.isArray(node)) node.forEach((x) => refsOf(x, out)); else if (node && typeof node === 'object') { for (const k of ['Column', 'Measure']) if (node[k] && node[k].Expression && node[k].Expression.SourceRef) out.push({ kind: k, entity: node[k].Expression.SourceRef.Entity, prop: node[k].Property }); Object.values(node).forEach((x) => refsOf(x, out)); } return out; };
  let visualCount = 0;
  for (const pid of pagesJ.pageOrder || []) {
    const pj = jp(path.join(pagesDir, pid, 'page.json')); if (!ok(!!pj, `Trang ${pid}: thiếu / hỏng page.json`)) continue;
    ok(pj.name === pid, `Trang ${pid}: tên trong page.json ("${pj.name}") khác tên thư mục`);
    ok(pj.displayName, `Trang ${pid}: thiếu displayName`); ok(pj.width > 0 && pj.height > 0, `Trang ${pid}: thiếu width/height`, 'W');
    const vdir = path.join(pagesDir, pid, 'visuals'); const vs = fs.existsSync(vdir) ? fs.readdirSync(vdir) : [];
    let kpi = 0; let dataVisuals = 0;
    for (const vn of vs) {
      const vp = path.join(vdir, vn, 'visual.json'); const v = jp(vp); if (!ok(!!v, `${rel(root, vp)}: thiếu / hỏng`)) continue; visualCount++;
      ok(v.name === vn, `Visual ${pid}/${vn}: tên trong file ("${v.name}") khác tên thư mục`);
      ok(String(v.name).length <= 50, `Visual ${vn}: tên dài hơn 50 ký tự`);
      const pos = v.position || {}; ok(['x', 'y', 'width', 'height'].every((k) => typeof pos[k] === 'number'), `Visual ${pid}/${vn}: thiếu position x/y/width/height`);
      if (v.visual) {
        if (KPI_TYPES.has(v.visual.visualType) && v.visual.query) kpi++;
        if (v.visual.query && v.visual.query.queryState) dataVisuals++;
        // trường dữ liệu có thật trong mô hình
        for (const r of refsOf(v.visual)) { checks++; const t = tables.get(String(r.entity).toLowerCase()); if (!t) { H(`${pid}/${vn}: tham chiếu bảng không có trong mô hình: ${r.entity}`); continue; } const key = String(r.prop).toLowerCase(); if (r.kind === 'Measure' ? !t.measures.has(key) : !t.columns.has(key)) H(`${pid}/${vn}: ${r.kind === 'Measure' ? 'measure' : 'cột'} "${r.entity}.${r.prop}" không có trong mô hình`); }
        // một queryRef một displayName
        const dn = new Map(); (function w(n) { if (Array.isArray(n)) n.forEach(w); else if (n && typeof n === 'object') { if (typeof n.queryRef === 'string' && typeof n.displayName === 'string') { if (!dn.has(n.queryRef)) dn.set(n.queryRef, new Set()); dn.get(n.queryRef).add(n.displayName); } Object.values(n).forEach(w); } })(v.visual.query);
        for (const [q, s] of dn) if (s.size > 1) H(`${pid}/${vn}: queryRef "${q}" có ${s.size} displayName khác nhau (Desktop từ chối)`);
        // mỗi instance trong objects phải có "properties"
        for (const key of ['objects', 'visualContainerObjects']) for (const [on, items] of Object.entries(v.visual[key] || {})) for (const it of items) { checks++; if (!it || typeof it.properties !== 'object') H(`${pid}/${vn}: ${key}.${on} có phần tử thiếu "properties"`); }
        // chuyển trang / tooltip
        for (const l of (v.visual.visualContainerObjects || {}).visualLink || []) { const to = l.properties && l.properties.navigationSection && l.properties.navigationSection.expr && l.properties.navigationSection.expr.Literal && l.properties.navigationSection.expr.Literal.Value; if (to) { checks++; if (!(pagesJ.pageOrder || []).includes(String(to).replace(/'/g, ''))) H(`${pid}/${vn}: nút chuyển tới trang không còn (${to})`); } }
        for (const l of (v.visual.visualContainerObjects || {}).visualTooltip || []) { const to = l.properties && l.properties.section && l.properties.section.expr && l.properties.section.expr.Literal && l.properties.section.expr.Literal.Value; if (to) { checks++; if (!(pagesJ.pageOrder || []).includes(String(to).replace(/'/g, ''))) H(`${pid}/${vn}: tooltip trỏ tới trang không còn (${to})`); } }
      }
      if (v.parentGroupName) { checks++; if (!vs.includes(v.parentGroupName)) H(`${pid}/${vn}: parentGroupName "${v.parentGroupName}" không còn`); }
    }
    ok(vs.length > 0, `Trang "${pj.displayName}" không có biểu đồ nào`, 'W');
    // quy tắc KPI 4–6
    ok(kpi <= KPI_MAX, `Trang "${pj.displayName}": ${kpi} thẻ KPI — vượt quy tắc tối đa ${KPI_MAX}`);
    if (kpi > 0 && kpi < KPI_MIN) W(`Trang "${pj.displayName}": chỉ ${kpi} thẻ KPI (nên ${KPI_MIN}–${KPI_MAX})`);
    notes.push(`Trang "${pj.displayName}": ${vs.length} visual, ${dataVisuals} biểu đồ dữ liệu, ${kpi} thẻ KPI`);
  }
  ok(visualCount > 0, 'Báo cáo không có visual nào');
  return { hard, warn, checks, notes, name };
}

module.exports = { validateBuild };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) { console.error('Usage: node validate_build.js <thư mục project PBIP>'); process.exit(2); }
  const r = validateBuild(dir);
  r.notes.forEach((n) => console.log('· ' + n));
  r.warn.forEach((w) => console.log('⚠ ' + w));
  r.hard.forEach((h) => console.log('✗ ' + h));
  console.log(`Kiểm tra bản build: ${r.checks} phép kiểm, ${r.hard.length} lỗi HARD, ${r.warn.length} cảnh báo`);
  process.exit(r.hard.length ? 1 : 0);
}
