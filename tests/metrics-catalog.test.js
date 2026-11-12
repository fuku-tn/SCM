// Danh mục chỉ số BI: build từ Excel, tra cứu, khớp dữ liệu, đưa định nghĩa vào prompt
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const M = require('../lib/metrics-catalog.js');
const { build } = require('../scripts/build-metrics-catalog.js');

const XLSX_FILE = path.join(__dirname, '..', 'documents', 'Business Intelligence Metrics.xlsx');

test('Danh mục: 8 lĩnh vực, mỗi chỉ số có tên/mô tả/công thức/mức quan trọng, tên không trùng trong lĩnh vực', () => {
  const cat = M.load(); assert.strictEqual(cat.domains.length, 8);
  for (const d of cat.domains) {
    const names = new Set();
    assert.ok(d.categories.length >= 2, d.id);
    for (const c of d.categories) for (const m of c.metrics) {
      assert.ok(m.name && m.description && m.formula, `${d.id}/${m.name}`); assert.match(m.importance, /^(High|Medium|Low)$/);
      assert.ok(!names.has(m.name.toLowerCase()), 'trùng ' + m.name); names.add(m.name.toLowerCase());
    }
  }
  assert.ok(M.all().length >= 250);
});
test('File JSON khớp với file Excel nguồn (chạy scripts/build-metrics-catalog.js khi sửa Excel)', { skip: !fs.existsSync(XLSX_FILE) }, () => {
  const fresh = build(XLSX_FILE), shipped = M.load();
  const flat = (c) => c.domains.flatMap((d) => d.categories.flatMap((x) => x.metrics.map((m) => d.id + '|' + m.name + '|' + m.formula)));
  assert.deepStrictEqual(flat(shipped), flat(fresh), 'knowledge-base/metrics-catalog.json đã cũ so với Excel — chạy: node scripts/build-metrics-catalog.js');
});
test('lookup: không phân biệt hoa/thường, bỏ phần ngoặc, nhận viết tắt', () => {
  assert.strictEqual(M.lookup('total revenue').name, 'Total Revenue');
  assert.strictEqual(M.lookup('Customer Lifetime Value').name, 'Customer Lifetime Value (CLV)');
  assert.strictEqual(M.lookup('NPS').name, 'Net Promoter Score (NPS)');
  assert.strictEqual(M.lookup('Doanh thu ngoài danh mục'), null);
});
test('fit: chỉ số tính được từ cột dữ liệu → high; thiếu cột → none; chưa có dữ liệu → null', () => {
  const prof = { sheets: [{ columns: [{ name: 'Revenue' }, { name: 'COGS' }, { name: 'Order Date' }] }] };
  assert.strictEqual(M.fit(M.lookup('Gross Profit Margin'), prof), 'high');
  assert.strictEqual(M.fit(M.lookup('Cost Per Click (CPC)'), prof), 'none');
  assert.strictEqual(M.fit(M.lookup('Gross Profit Margin'), { sheets: [] }), null);
});
test('domainFor: đoán lĩnh vực từ phòng ban/vị trí', () => {
  assert.strictEqual(M.domainFor('Phòng Kinh doanh'), 'sales'); assert.strictEqual(M.domainFor('Nhân sự'), 'hr'); assert.strictEqual(M.domainFor('Marketing', 'Trưởng nhóm'), 'digital-marketing'); assert.strictEqual(M.domainFor('xyz'), null);
});
test('definitionsMd: chỉ số có trong danh mục được đưa vào prompt với công thức; chỉ số ngoài danh mục bị bỏ qua', () => {
  const md = M.definitionsMd(['Total Revenue', 'Gross Profit Margin', 'Chỉ số tự đặt']);
  assert.match(md, /ĐỊNH NGHĨA CHỈ SỐ TỪ DANH MỤC/); assert.match(md, /Sum of all Sales Revenue/); assert.match(md, /Revenue - COGS/); assert.ok(!/tự đặt/.test(md));
  assert.strictEqual(M.definitionsMd(['Chỉ số tự đặt']), '');
});
