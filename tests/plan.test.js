// Bố cục dashboard (lib/plan.js), file mẫu & đọc hồ sơ người xem (lib/samples.js), nhân bản trang / Top N / đổi loại biểu đồ khi dựng PBIP
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');
const P = require('../lib/plan.js');
const S = require('../lib/samples.js');
const T = require('../lib/pbix-template.js');
const { validateBuild } = require('../skills/04-dashboard-pbip/scripts/validate_build.js');

const PROFILE = { sheets: [{ name: 'Orders', rowCount: 5000, columns: [
  { name: 'Order Date', type: 'date', distinct: 900, min: '2021-01-03', max: '2024-12-30' }, { name: 'Product Name', type: 'text', distinct: 42 }, { name: 'Region', type: 'text', distinct: 4 },
  { name: 'Sales', type: 'number', distinct: 100 }, { name: 'Gross Profit', type: 'number', distinct: 100 }] }] };
const FORM = { metrics: ['Sales', 'Gross Profit', 'Orders', 'Units', 'Margin %'], dimensions: ['Product Name', 'Region', 'Order Date'], sheets: ['Orders'] };
const ctxOf = (id, o = {}) => ({ tpl: T.loadTemplate(id), form: FORM, profile: PROFILE, lang: 'en', aud: { pages: [3, 5] }, ...o });

// ---------------- samples ----------------
test('File mẫu .docx: 3 mẫu đọc lại được, mẫu Business Context có mốc tách 2 phần', () => {
  for (const k of Object.keys(S.SAMPLES)) { const b = S.docxBlocks(S.SAMPLES[k].build()); assert.ok(b.text.length > 100, k); }
  assert.ok(S.docxBlocks(S.SAMPLES['business-context'].build()).text.includes(S.MARK_REQ));
  // mẫu để trống → không điền gì (chữ gợi ý "VD..." bị bỏ qua), hàng ví dụ của Indirect bị bỏ
  assert.deepStrictEqual(S.parseDirect(S.docxBlocks(S.SAMPLES['audience-direct'].build()).text).fields, {});
  assert.deepStrictEqual(S.parseIndirect(S.docxBlocks(S.SAMPLES['audience-indirect'].build()).tables), []);
});
test('Đọc hồ sơ Direct (Nhãn: giá trị) và Indirect (bảng Markdown, nhiều người)', () => {
  const d = S.parseDirect('Phòng ban: Kinh doanh\n- Vị trí công việc hiện tại: Trưởng nhóm\nLevel: Manager\nGiới tính: nữ\nHọc vấn: thạc sĩ\nThâm niên tại doanh nghiệp hiện tại: 3 năm\nThường đọc báo cáo bằng: điện thoại');
  assert.strictEqual(d.fields.department, 'Kinh doanh'); assert.strictEqual(d.fields.gender, 'Nữ'); assert.strictEqual(d.fields.education, 'Thạc sĩ / MBA'); assert.strictEqual(d.fields.tenureCompany, '3 năm');
  assert.ok(d.notes.some((n) => /điện thoại/.test(n)), 'dòng không phải trường → ghi chú');
  const md = '| Họ tên / nhóm | Phòng ban | Level | Giới tính | Học vấn | Họ cần gì từ dashboard |\n|---|---|---|---|---|---|\n| GĐ | KD | Director | Nam | Đại học | xem nhanh |\n| Kế toán trưởng | Tài chính | Manager | Nữ | Thạc sĩ | đối soát |\n';
  const people = S.parseIndirect(S.mdTables(md));
  assert.strictEqual(people.length, 2); assert.strictEqual(people[1].education, 'Thạc sĩ / MBA'); assert.strictEqual(people[0].note, 'xem nhanh');
});

// ---------------- plan ----------------
for (const id of ['sale', 'hr']) {
  test(`Plan (${id}): ô thuộc đúng trang template, ≤ 6 thẻ KPI/trang, trang trùng nguồn là bản nhân bản`, () => {
    const ctx = ctxOf(id); const plan = P.normalize(P.heuristic(ctx), ctx);
    const pages = new Map(P.pagesOf(ctx.tpl).map((p) => [p.no, new Set(p.slots.map((s) => s.key))]));
    assert.ok(plan.pages.length >= 2);
    const seen = new Set();
    for (const p of plan.pages) {
      assert.ok(pages.has(p.from)); assert.strictEqual(p.clone, seen.has(p.from), p.id); seen.add(p.from);
      const used = new Set();
      for (const v of p.visuals) { if (!v.slot) continue; assert.ok(pages.get(p.from).has(v.slot), `${v.slot} thuộc trang ${p.from}`); assert.ok(!used.has(v.slot), 'mỗi ô tối đa 1 lần'); used.add(v.slot); }
      assert.ok(p.visuals.filter((v) => v.role === 'kpi' && !v.remove).length <= 6, p.id + ' KPI');
    }
  });
}
test('Plan: chiều nhiều giá trị → Top N; donut/pie không dùng với chiều nhiều giá trị; time axis không bị giới hạn', () => {
  const ctx = ctxOf('sale');
  const raw = { pages: [{ title: 'A', from: 2, visuals: [
    { slot: '2.78243b', type: 'donutChart', measure: 'Sales', dimension: 'Product Name' },
    { slot: '2.e9ae97', type: 'lineClusteredColumnComboChart', measure: 'Sales', dimension: 'Order Date' }] }] };
  const plan = P.normalize(raw, ctx); const [donut, trend] = plan.pages[0].visuals;
  assert.notStrictEqual(donut.dimension, 'Product Name', 'donut không dùng chiều 42 giá trị'); assert.ok(donut.distinct <= 5, 'chuyển sang chiều ít giá trị: ' + donut.dimension);
  assert.strictEqual(trend.topN, null);
  // bar với 42 giá trị → Top N
  const ctxHr = ctxOf('hr'); const hr = P.pagesOf(ctxHr.tpl).find((p) => p.slots.some((s) => s.type === 'clusteredBarChart'));
  const bar = hr.slots.find((s) => s.type === 'clusteredBarChart');
  const p2 = P.normalize({ pages: [{ title: 'B', from: hr.no, visuals: [{ slot: bar.key, type: 'clusteredBarChart', measure: 'Sales', dimension: 'Product Name' }] }] }, ctxHr);
  assert.strictEqual(p2.pages[0].visuals[0].topN, 10); assert.match(p2.pages[0].visuals[0].guard.text, /Top 10/);
});
test('Plan: đổi loại chỉ trong cùng họ; chỉ số/chiều thiếu → cảnh báo', () => {
  const ctx = ctxOf('sale', { form: { ...FORM, metrics: ['Sales', 'Lợi nhuận ròng'] } });
  const plan = P.normalize({ pages: [{ title: 'A', from: 2, visuals: [{ slot: '2.78243b', type: 'clusteredBarChart', measure: 'Sales', dimension: 'Region' }, { slot: '2.e9ae97', type: 'donutChart', measure: 'Sales', dimension: 'Order Date' }] }] }, ctx);
  const [a, b] = plan.pages[0].visuals;
  assert.strictEqual(a.type, 'donutChart', 'donut chỉ đổi được sang pie/donut'); assert.strictEqual(b.type, b.slotType);
  assert.ok(plan.warnings.some((w) => /Lợi nhuận ròng/.test(w)), 'thiếu chỉ số');
});
test('Plan → khung spec: keep/clones/order + khóa clone "<cloneId>:<key>"', () => {
  const ctx = ctxOf('sale'); const plan = P.normalize(P.heuristic(ctx), ctx); const sk = P.toSpecSkeleton(plan, ctx.tpl);
  const clones = plan.pages.filter((p) => p.clone);
  assert.strictEqual(sk.pages.clones.length, clones.length);
  assert.ok(clones.every((c) => Object.keys(sk.bind).some((k) => k.startsWith(c.cid + ':'))));
  assert.match(P.toMarkdown(plan, ctx.tpl), /BẢN NHÂN BẢN/);
});

// ---------------- dựng PBIP: clone + visualType + topN ----------------
const SHEETS = {
  'Don hang': [['Mã đơn', 'Ngày', 'Mã KH', 'Khu vực', 'Doanh thu', 'Chi phí']].concat(Array.from({ length: 60 }, (_, i) => [i + 1, new Date(Date.UTC(2024, i % 12, 1 + (i % 27))), 'KH' + (1 + (i % 5)), ['Bắc', 'Trung', 'Nam', 'Tây', 'Đông'][i % 5], 1000 + i * 10, 600 + i * 5])),
};
const SPEC2 = {
  metrics: [{ id: 'rev', label: 'Doanh thu', kind: 'numerical', table: 'Don hang', column: 'Doanh thu', aggregations: ['SUM'] }, { id: 'cost', label: 'Chi phí', kind: 'numerical', table: 'Don hang', column: 'Chi phí', aggregations: ['SUM'] }],
  dimensions: [{ id: 'date', label: 'Ngày', table: 'Don hang', column: 'Ngày', isDate: true }, { id: 'region', label: 'Khu vực', table: 'Don hang', column: 'Khu vực' }],
  derived: [], performance: [], timeApplyTo: [], combos: [],
};
let run;
before(() => {
  run = h.makeRun({ name: 'plan', sheets: SHEETS, form: { template: 'sale', colorMode: 'template', dashboardLanguage: 'en', metrics: ['Doanh thu'], dimensions: ['Khu vực'] } });
  const r = h.etl(run); assert.strictEqual(r.post.status, 0, r.pre.out + r.post.out);
  h.fs.writeFileSync(h.path.join(run, '02-key-metrics', 'metrics-spec.json'), JSON.stringify(SPEC2));
  assert.strictEqual(h.script('02-key-metrics', 'post', run).status, 0);
});
after(() => h.rm(run));

test('Chặng 4: nhân bản trang template, đổi pie↔donut, Top N sinh measure RANKX, validate_build sạch', () => {
  const ms = h.readJson(h.path.join(run, '02-key-metrics', 'measures.json')); const rev = (ms.measures || ms).find((m) => /Doanh thu/.test(m.name) && m.kind === 'base').name;
  const dim = { table: 'Don hang', column: 'Khu vực' };
  const spec = {
    template: 'sale', projectName: 'Plan_Test',
    pages: { keep: ['1', '2'], clones: [{ id: 'p3', from: '2', name: 'Region deep-dive' }], rename: { 2: 'Sales overview' }, order: ['1', '2', 'p3'] },
    bind: {
      '2.56ba69': { title: 'Revenue', roles: { Data: [rev] } },
      '2.78243b': { title: 'Revenue by region', roles: { Category: [dim], Y: [rev] }, visualType: 'pieChart', topN: 3 },
      'p3:2.56ba69': { title: 'Revenue (clone)', roles: { Data: [rev] } },
      'p3:2.78243b': { title: 'Revenue by region (clone)', roles: { Category: [dim], Y: [rev] }, visualType: 'clusteredBarChart' },   // ngoài họ → bị bỏ qua kèm cảnh báo
    },
  };
  h.fs.writeFileSync(h.path.join(run, '04-dashboard-pbip', 'dashboard-spec.json'), JSON.stringify(spec));
  const r = h.script('04-dashboard-pbip', 'post', run); assert.strictEqual(r.status, 0, r.out);
  const proj = h.fs.readdirSync(h.path.join(run, '04-dashboard-pbip', 'pbip'))[0];
  const root = h.path.join(run, '04-dashboard-pbip', 'pbip', proj);
  const pagesDir = h.path.join(root, proj + '.Report', 'definition', 'pages');
  const order = h.readJson(h.path.join(pagesDir, 'pages.json')).pageOrder;
  assert.strictEqual(order.length, 3, 'Home + Overview + 1 bản nhân bản');
  const names = order.map((id) => h.readJson(h.path.join(pagesDir, id, 'page.json')).displayName);
  assert.deepStrictEqual(names.slice(1), ['Sales overview', 'Region deep-dive']);
  const visTypes = (pid) => h.fs.readdirSync(h.path.join(pagesDir, pid, 'visuals')).map((d) => h.readJson(h.path.join(pagesDir, pid, 'visuals', d, 'visual.json'))).filter((v) => v.visual).map((v) => v.visual.visualType);
  assert.ok(visTypes(order[1]).includes('pieChart'), 'donut → pie'); assert.ok(visTypes(order[2]).includes('donutChart'), 'ngoài họ giữ donut'); assert.match(r.out, /không đổi được/);
  const tm = h.fs.readFileSync(h.path.join(root, proj + '.SemanticModel', 'definition', 'tables', 'Don hang.tmdl'), 'utf8');
  assert.match(tm, /\(Top 3\)/); assert.match(tm, /RANKX\(ALL\('Don hang'\[Khu vực\]\)/);
  const v = validateBuild(root); assert.deepStrictEqual(v.hard, [], v.hard.join('\n'));
});

test('Kỳ so sánh "liền trước" (PY/PQ/PM) sinh measure PREVIOUS*; Version không sinh DAX', () => {
  const d = h.makeRun({ name: 'cmp', sheets: SHEETS, form: { periods: ['PY', 'PM', 'YoY'], versions: ['BUD'], metrics: ['Doanh thu'] } });
  try {
    assert.strictEqual(h.etl(d).post.status, 0);
    h.fs.writeFileSync(h.path.join(d, '02-key-metrics', 'metrics-spec.json'), JSON.stringify({ ...SPEC2, timeApplyTo: ['rev.SUM'] }));
    const r = h.script('02-key-metrics', 'post', d); assert.strictEqual(r.status, 0, r.out);
    const ms = h.readJson(h.path.join(d, '02-key-metrics', 'measures.json')).measures;
    const by = (n) => ms.find((m) => / PY$/.test(m.name) && n === 'PY') || ms.find((m) => new RegExp(' ' + n + '$').test(m.name));
    assert.match(by('PY').expression, /PREVIOUSYEAR\('Calendar'\[Date\]\)/); assert.match(by('PM').expression, /PREVIOUSMONTH/); assert.match(by('LY').expression, /SAMEPERIODLASTYEAR/);
    assert.ok(!ms.some((m) => /Budget|BUD/i.test(m.name)), 'Version không tự sinh measure');
  } finally { h.rm(d); }
});
