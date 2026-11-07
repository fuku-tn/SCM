// Cổng Version: nhận diện dữ liệu, file mẫu ↔ đọc lại, sinh measure bằng script, dựng PBIP có bảng Versions
const { test } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const h = require('./helpers');
const V = require('../lib/versions.js');
const { validateBuild } = require('../skills/04-dashboard-pbip/scripts/validate_build.js');

test('detect: nhận Budget/Forecast trong tên cột; Rolling Forecast không bị nhầm với Forecast', () => {
  const checks = { tables: [{ name: 'Sales', columns: [{ name: 'Revenue', type: 'decimal' }, { name: 'Revenue Budget', type: 'decimal' }, { name: 'Rolling Forecast Revenue', type: 'decimal' }, { name: 'Note Budget', type: 'text' }] }] };
  const d = V.detect(checks, ['BUD', 'FCST', 'RFCST', 'TGT']);
  assert.ok(d.found.BUD && d.found.BUD[0].column === 'Revenue Budget', 'cột số có chữ Budget');
  assert.ok(d.found.RFCST, 'Rolling Forecast');
  assert.deepStrictEqual(d.missing.sort(), ['FCST', 'TGT'], 'Forecast thường và Target chưa có (cột Rolling Forecast không tính là Forecast; cột chữ không tính)');
});

test('File mẫu: để trống → báo chưa điền; điền số → đọc được, báo Version còn thiếu', () => {
  const buf = V.sampleBuffer({ metrics: ['Sales (SUM)', 'Cost'], versions: ['BUD', 'FCST'], start: '2024-03-15' });
  const wb = XLSX.read(buf, { type: 'buffer' });
  assert.deepStrictEqual(wb.SheetNames, ['Versions', 'Guide']);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Versions, { header: 1 });
  assert.deepStrictEqual(rows[0], ['Date', 'Version', 'Sales', 'Cost'], 'tên chỉ số bỏ phần (SUM)');
  assert.strictEqual(rows[1][0], '2024-03-01', 'bắt đầu từ đầu tháng của dữ liệu');
  const blank = V.parseWorkbook(wb, ['BUD', 'FCST']); assert.strictEqual(blank.ok, false); assert.match(blank.errors.join(' '), /chưa có cột số|chưa được điền/i);
  // điền Budget
  const filled = XLSX.utils.aoa_to_sheet([rows[0], ...rows.slice(1).filter((r) => r[1] === 'Budget').map((r, i) => [r[0], r[1], 100 + i, 50 + i])]);
  const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, filled, 'Versions');
  const ok = V.parseWorkbook(wb2, ['BUD', 'FCST']);
  assert.ok(ok.ok); assert.strictEqual(ok.rows, 3); assert.deepStrictEqual(ok.stillMissing, ['FCST']); assert.match(ok.csv, /^Date,Version,Sales,Cost\n2024-03-01,Budget,100,50/);
  // thiếu cột Version → lỗi rõ ràng
  const bad = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(bad, XLSX.utils.aoa_to_sheet([['Date', 'Sales'], ['2024-01-01', 5]]), 'Versions');
  assert.match(V.parseWorkbook(bad, ['BUD']).errors.join(' '), /Version/);
});

test('genMeasures: DAX do script sinh, ghép đúng measure thực tế, tên không trùng', () => {
  const existing = [{ id: 'sales.SUM', name: 'Sales (SUM)', table: 'data', kind: 'base', format: '#,##0' }, { id: 'cost.SUM', name: 'Cost (SUM)', table: 'data', kind: 'base' }];
  const meta = { versions: { Budget: 3, Forecast: 3 }, metrics: ['Sales'], dims: [] };
  const g = V.genMeasures(existing, meta, {});
  const by = (n) => g.find((m) => m.name === n);
  assert.strictEqual(by('Sales Budget').expression, `CALCULATE(SUM('Versions'[Sales]), 'Versions'[Version] = "Budget")`);
  assert.strictEqual(by('Sales vs Budget').expression, '[Sales (SUM)] - [Sales Budget]');
  assert.match(by('Sales vs Forecast %').expression, /^DIVIDE\(\[Sales \(SUM\)\] - \[Sales Forecast\], \[Sales Forecast\]\)$/);
  assert.strictEqual(g.length, 6); assert.ok(g.every((m) => m.kind === 'version' && m.folder === 'Version'));
  assert.strictEqual(new Set(g.map((m) => m.name.toLowerCase())).size, g.length, 'không trùng tên');
});

test('Áp vào run + dựng PBIP: bảng Versions nối Calendar, measure Version có trong model, validate_build sạch', () => {
  const csv = 'Order Date,Region,Sales\n' + Array.from({ length: 30 }, (_, i) => `2024-0${1 + (i % 6)}-1${i % 9},${['N', 'S'][i % 2]},${100 + i}`).join('\n') + '\n';
  const d = h.makeRun({ csv, form: { versions: ['BUD'], metrics: ['Sales'], dashboardLanguage: 'en' } });
  try {
    assert.strictEqual(h.etl(d).post.status, 0);
    h.fs.writeFileSync(h.path.join(d, '02-key-metrics', 'metrics-spec.json'), JSON.stringify({ metrics: [{ id: 'sales', label: 'Sales', kind: 'numerical', table: 'data', column: 'Sales', aggregations: ['SUM'] }], dimensions: [{ id: 'date', label: 'Order Date', table: 'data', column: 'Order Date', isDate: true }], derived: [], performance: [], timeApplyTo: [], combos: [] }));
    assert.strictEqual(h.script('02-key-metrics', 'post', d).status, 0);
    const dir = h.path.join(d, '00-input', 'version'); h.fs.mkdirSync(dir, { recursive: true });
    h.fs.writeFileSync(h.path.join(dir, 'Versions.csv'), 'Date,Version,Sales\n2024-01-01,Budget,500\n2024-02-01,Budget,520\n');
    h.fs.writeFileSync(h.path.join(dir, 'versions.json'), JSON.stringify({ rows: 2, versions: { Budget: 2 }, metrics: ['Sales'], dims: [], columns: [{ name: 'Date', type: 'date' }, { name: 'Version', type: 'text' }, { name: 'Sales', type: 'decimal' }], stillMissing: [] }));
    const r = V.applyToRun(d, { useUpload: true, found: {} }); assert.strictEqual(r.table, true); assert.ok(r.measures >= 3);
    V.applyToRun(d, { useUpload: true, found: {} });   // chạy lại không nhân đôi
    const mj = h.readJson(h.path.join(d, '02-key-metrics', 'measures.json')); assert.strictEqual(mj.measures.filter((m) => m.kind === 'version').length, r.measures);
    const s4 = h.script('04-dashboard-pbip', 'post', d); assert.strictEqual(s4.status, 0, s4.out);
    const proj = h.fs.readdirSync(h.path.join(d, '04-dashboard-pbip', 'pbip'))[0], root = h.path.join(d, '04-dashboard-pbip', 'pbip', proj);
    assert.ok(h.fs.existsSync(h.path.join(root, 'data', 'Versions.csv')));
    const rel = h.fs.readFileSync(h.path.join(root, proj + '.SemanticModel', 'definition', 'relationships.tmdl'), 'utf8'); assert.match(rel, /Versions\.Date|Versions.*Date/);
    const tm = h.fs.readFileSync(h.path.join(root, proj + '.SemanticModel', 'definition', 'tables', 'data.tmdl'), 'utf8'); assert.match(tm, /Sales Budget/); assert.match(tm, /CALCULATE\(SUM\('Versions'\[Sales\]\)/);
    const v = validateBuild(root); assert.deepStrictEqual(v.hard, [], v.hard.join('\n'));
  } finally { h.rm(d); }
});
