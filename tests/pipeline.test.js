// Test chặng 2 (DAX từ metrics-spec) và chặng 4 (dựng PBIP: không template / sale / hr) + validate_build
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const h = require('./helpers');
const { validateBuild } = require('../skills/04-dashboard-pbip/scripts/validate_build.js');

const SHEETS = {
  'Don hang': [['Mã đơn', 'Ngày', 'Mã KH', 'Khu vực', 'Doanh thu', 'Chi phí', 'Số lượng']].concat(
    Array.from({ length: 60 }, (_, i) => [i + 1, new Date(Date.UTC(2024, i % 12, 1 + (i % 27))), 'KH' + (1 + (i % 5)), ['Bắc', 'Trung', 'Nam'][i % 3], 1000 + i * 10, 600 + i * 5, 1 + (i % 4)])),
  'Khach hang': [['Mã KH', 'Tên', 'Phân khúc'], ['KH1', 'An', 'VIP'], ['KH2', 'Bình', 'Thường'], ['KH3', 'Chi', 'VIP'], ['KH4', 'Dũng', 'Thường'], ['KH5', 'Em', 'Mới']],
};
const SPEC = {
  metrics: [
    { id: 'rev', label: 'Doanh thu', kind: 'numerical', table: 'Don hang', column: 'Doanh thu', aggregations: ['SUM'], unit: 'VND' },
    { id: 'cost', label: 'Chi phí', kind: 'numerical', table: 'Don hang', column: 'Chi phí', aggregations: ['SUM'] },
    { id: 'orders', label: 'Số đơn hàng', kind: 'categorical', table: 'Don hang', column: 'Mã đơn', aggregations: ['DISTINCTCOUNT'] }],
  derived: [{ id: 'profit', label: 'Lợi nhuận', expression: '{rev.SUM} - {cost.SUM}' }],
  performance: [{ id: 'aov', label: 'Doanh thu / đơn', numerator: 'rev.SUM', denominator: 'orders.DISTINCTCOUNT' }],
  timeApplyTo: ['rev.SUM', 'profit', 'orders.DISTINCTCOUNT'],
  dimensions: [{ id: 'date', label: 'Ngày', table: 'Don hang', column: 'Ngày', isDate: true }, { id: 'region', label: 'Khu vực', table: 'Don hang', column: 'Khu vực' }, { id: 'seg', label: 'Phân khúc', table: 'Khach hang', column: 'Phân khúc' }],
  combos: [],
};

let base;
before(() => {
  base = h.makeRun({ name: 'base', sheets: SHEETS, form: { metrics: ['Doanh thu'], dimensions: ['Khu vực'], periods: ['YoY', 'MoM'] } });
  const r = h.etl(base); assert.strictEqual(r.post.status, 0, r.pre.out + r.post.out);
  h.fs.writeFileSync(h.path.join(base, '02-key-metrics', 'metrics-spec.json'), JSON.stringify(SPEC));
});
after(() => h.rm(base));

test('Chặng 2: sinh measures.json + DAX hợp lệ', () => {
  const r = h.script('02-key-metrics', 'post', base); assert.strictEqual(r.status, 0, r.out);
  const m = h.readJson(h.path.join(base, '02-key-metrics', 'measures.json'));
  const list = m.measures || m;
  assert.ok(list.length >= 6, 'có đủ measure cơ bản + time intelligence: ' + list.length);
  const names = list.map((x) => x.name);
  assert.ok(names.some((n) => /Doanh thu/.test(n)));
  assert.ok(names.some((n) => /Lợi nhuận/.test(n)));
  list.forEach((x) => { assert.ok(x.expression || x.dax, 'measure có công thức: ' + x.name); });
});

function stage4(mode) {
  const d = h.fs.mkdtempSync(h.path.join(require('os').tmpdir(), 'bie-test-s4-'));
  h.fs.cpSync(base, d, { recursive: true });
  const run = h.readJson(h.path.join(d, 'run.json')); run.form.template = mode === 'none' ? '' : mode; run.form.colorMode = 'template';
  h.fs.writeFileSync(h.path.join(d, 'run.json'), JSON.stringify(run));
  const r = h.script('04-dashboard-pbip', 'post', d);
  const proj = h.fs.readdirSync(h.path.join(d, '04-dashboard-pbip', 'pbip'))[0];
  return { d, r, root: h.path.join(d, '04-dashboard-pbip', 'pbip', proj || '') };
}

for (const mode of ['none', 'sale', 'hr']) {
  test(`Chặng 4 — template="${mode}": dựng PBIP, validate_build 0 lỗi cứng, KPI ≤ 6/trang`, () => {
    const { d, r, root } = stage4(mode);
    try {
      assert.strictEqual(r.status, 0, r.out);
      const v = validateBuild(root);
      assert.deepStrictEqual(v.hard, [], 'lỗi cứng: ' + v.hard.join('\n'));
      assert.ok(h.fs.existsSync(h.path.join(root, 'SetDataFolder.ps1')), 'có SetDataFolder.ps1');
      assert.match(h.fs.readFileSync(h.path.join(root, 'README.md'), 'utf8'), /Refresh/);
      const csvs = h.fs.readdirSync(h.path.join(root, 'data')).filter((f) => f.endsWith('.csv'));
      assert.ok(csvs.length >= 2, 'dữ liệu sạch được chép vào data/');
    } finally { h.rm(d); }
  });
}

test('validate_build bắt được lỗi: thiếu file CSV, JSON hỏng', () => {
  const { d, root } = stage4('none');
  try {
    // 1) thiếu CSV
    const csv = h.fs.readdirSync(h.path.join(root, 'data')).find((f) => f.endsWith('.csv'));
    h.fs.rmSync(h.path.join(root, 'data', csv));
    let v = validateBuild(root);
    assert.ok(v.hard.some((x) => /csv|data/i.test(x)), 'báo thiếu CSV: ' + v.hard.join(' | '));
    // 2) JSON hỏng
    const pj = h.path.join(root, h.fs.readdirSync(root).find((f) => f.endsWith('.Report')), 'definition', 'report.json');
    h.fs.writeFileSync(pj, '{ not json');
    v = validateBuild(root);
    assert.ok(v.hard.some((x) => /json|parse/i.test(x)), 'báo JSON hỏng: ' + v.hard.join(' | '));
  } finally { h.rm(d); }
});

test('validate_build CLI: exit 1 khi có lỗi cứng, exit 0 khi sạch', () => {
  const { d, root } = stage4('sale');
  try {
    const cli = h.path.join(h.ROOT, 'skills', '04-dashboard-pbip', 'scripts', 'validate_build.js');
    assert.strictEqual(cp.spawnSync(process.execPath, [cli, root]).status, 0);
    h.fs.rmSync(h.path.join(root, h.fs.readdirSync(root).find((f) => f.endsWith('.pbip'))));
    assert.strictEqual(cp.spawnSync(process.execPath, [cli, root]).status, 1);
  } finally { h.rm(d); }
});

test('Template HR (nhiều KPI gốc): mỗi trang không quá 6 thẻ KPI', () => {
  const { d, root } = stage4('hr');
  try {
    const v = validateBuild(root);
    assert.ok(!v.hard.some((x) => /KPI/i.test(x)), v.hard.join(' | '));
  } finally { h.rm(d); }
});
