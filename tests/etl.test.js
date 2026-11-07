// Test chặng 3 (pre.js làm sạch + modeling, post.js model-spec)
const { test } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

const clean = (dir, f) => h.fs.readFileSync(h.path.join(dir, '03-data-etl', 'clean', f), 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
const checks = (dir) => h.readJson(h.path.join(dir, '03-data-etl', 'data-checks.json'));

test('CSV dấu ; + số kiểu châu Âu + ngày dd/mm/yyyy + dòng tổng + N/A', () => {
  const csv = 'Mã đơn;Ngày;Khu vực;Doanh thu\n1;01/02/2025;Bắc;"1.234,56"\n2;02/02/2025;Nam;"2.000,00"\n3;03/02/2025;Bắc;N/A\n;;;\nTổng cộng;;;"3.234,56"\n';
  const d = h.makeRun({ csv });
  try {
    const r = h.etl(d); assert.strictEqual(r.pre.status, 0, r.pre.out); assert.strictEqual(r.post.status, 0, r.post.out);
    const rows = clean(d, 'data.csv');
    assert.deepStrictEqual(rows[0], ['Mã đơn', 'Ngày', 'Khu vực', 'Doanh thu']);
    assert.strictEqual(rows.length, 4, 'bỏ dòng trống + dòng Tổng cộng');
    assert.strictEqual(rows[1][1], '2025-02-01', 'dd/mm/yyyy, không lệch múi giờ');
    assert.strictEqual(rows[1][3], '1234.56', 'số châu Âu');
    assert.strictEqual(rows[3][3], '', 'N/A → trống');
  } finally { h.rm(d); }
});

test('CSV chuẩn (dấu , và số 1,234.56 trong ngoặc kép)', () => {
  const csv = 'id,date,amount\n1,2025-03-01,"1,234.50"\n2,2025-03-02,10\n';
  const d = h.makeRun({ csv });
  try {
    const r = h.etl(d); assert.strictEqual(r.pre.status, 0, r.pre.out);
    const rows = clean(d, 'data.csv');
    assert.strictEqual(rows[1][2], '1234.5');
    assert.strictEqual(rows[1][1], '2025-03-01');
  } finally { h.rm(d); }
});

test('Không có cột ngày: model-spec không có dateColumn, không lỗi', () => {
  const d = h.makeRun({ csv: 'Sản phẩm,Giá\nA,10\nB,20\nC,30\n' });
  try {
    const r = h.etl(d); assert.strictEqual(r.post.status, 0, r.post.out);
    const ms = h.readJson(h.path.join(d, '03-data-etl', 'model-spec.json'));
    assert.ok(!ms.dateColumn, 'không có dateColumn');
    assert.ok(ms.tables.length >= 1);
  } finally { h.rm(d); }
});

test('Excel: dòng tiêu đề gộp ở trên, header thật ở hàng 3', () => {
  const sheets = { 'Báo cáo': [['BÁO CÁO DOANH THU THÁNG 3', null, null], [null, null, null], ['Mã', 'Khu vực', 'Doanh thu'], ['A1', 'Bắc', 100], ['A2', 'Nam', 200], ['A3', 'Bắc', 300]] };
  const d = h.makeRun({ sheets });
  try {
    const r = h.etl(d); assert.strictEqual(r.pre.status, 0, r.pre.out);
    const rows = clean(d, 'Bao_cao.csv');
    assert.deepStrictEqual(rows[0], ['Mã', 'Khu vực', 'Doanh thu']);
    assert.strictEqual(rows.length, 4);
  } finally { h.rm(d); }
});

test('Nhiều sheet: PK/FK lệch định dạng (001 vs 1) vẫn nối được', () => {
  const sheets = {
    'Don hang': [['Mã đơn', 'Mã KH', 'Doanh thu'], [1, '001', 10], [2, '002', 20], [3, '001', 30], [4, '003', 40]],
    'Khach hang': [['Mã KH', 'Tên'], [1, 'An'], [2, 'Bình'], [3, 'Chi']],
  };
  const d = h.makeRun({ sheets });
  try {
    const r = h.etl(d); assert.strictEqual(r.pre.status, 0, r.pre.out);
    const c = checks(d);
    assert.ok(c.relationships.candidates.length >= 1, 'có ứng viên quan hệ');
    assert.strictEqual(c.relationships.unresolved.length, 0, JSON.stringify(c.relationships.unresolved));
    assert.strictEqual(r.post.status, 0, r.post.out);
    const ms = h.readJson(h.path.join(d, '03-data-etl', 'model-spec.json'));
    assert.ok(ms.relationships.length >= 1);
  } finally { h.rm(d); }
});

test('Bảng rộng (40 cột) không lỗi', () => {
  const head = Array.from({ length: 40 }, (_, i) => 'Cột ' + (i + 1));
  const rows = Array.from({ length: 30 }, (_, r) => head.map((_, c) => (c === 0 ? 'K' + r : r * c)));
  const d = h.makeRun({ sheets: { Wide: [head, ...rows] } });
  try {
    const r = h.etl(d); assert.strictEqual(r.pre.status, 0, r.pre.out);
    assert.strictEqual(checks(d).tables[0].columns.length, 40);
  } finally { h.rm(d); }
});

test('Tiêu đề tiếng Việt có dấu được giữ nguyên từng ký tự', () => {
  const d = h.makeRun({ csv: 'Nhân viên,Phòng ban,Lương cơ bản\nAn,Kế toán,1000\nBình,Kinh doanh,2000\n' });
  try {
    h.etl(d);
    assert.deepStrictEqual(clean(d, 'data.csv')[0], ['Nhân viên', 'Phòng ban', 'Lương cơ bản']);
  } finally { h.rm(d); }
});
