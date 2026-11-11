// Các trang dùng chung một trang template phải đa dạng loại biểu đồ + chiều (không "y hệt nhau")
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../lib/plan.js');
const T = require('../lib/pbix-template.js');

const PROFILE = { sheets: [{ name: 'Orders', rowCount: 5000, columns: [
  { name: 'Order Date', type: 'date', distinct: 900, min: '2021-01-03', max: '2024-12-30' }, { name: 'Product Name', type: 'text', distinct: 42 }, { name: 'Region', type: 'text', distinct: 4 },
  { name: 'Channel', type: 'text', distinct: 5 }, { name: 'Segment', type: 'text', distinct: 3 }, { name: 'Sales', type: 'number', distinct: 100 }, { name: 'Margin %', type: 'number', distinct: 100 }] }] };
const FORM = { metrics: ['Sales', 'Margin %', 'Orders', 'Units'], dimensions: ['Product Name', 'Region', 'Channel', 'Segment', 'Order Date'], sheets: ['Orders'] };

for (const id of ['sale', 'hr']) {
  test(`Đa dạng (${id}): trang cùng khung template khác nhau về loại biểu đồ; trang nhân bản không lặp chữ ký`, () => {
    const ctx = { tpl: T.loadTemplate(id), form: FORM, profile: PROFILE, lang: 'en', aud: { pages: [5, 6] } };
    const plan = P.normalize(P.heuristic(ctx), ctx);
    const bySrc = new Map();
    for (const p of plan.pages) { const sig = p.visuals.filter((v) => !v.remove && v.slot).map((v) => v.slot + ':' + v.type).join('|'); (bySrc.get(p.from) || bySrc.set(p.from, []).get(p.from)).push(sig); }
    let multi = 0;
    for (const sigs of bySrc.values()) if (sigs.length > 1) { multi++; const u = new Set(sigs).size; assert.ok(u >= Math.min(sigs.length, 4), `chỉ ${u}/${sigs.length} kiểu bố cục khác nhau`); if (u < sigs.length) assert.ok(plan.warnings.some((w) => /cùng khung template/.test(w)), 'còn trùng thì phải cảnh báo'); }
    assert.ok(multi >= 1, 'bài test cần ít nhất 1 trang template được dùng lại');
    // mọi loại vẫn nằm trong họ cho phép của ô
    for (const p of plan.pages) for (const v of p.visuals) if (v.slot) assert.ok(v.typeOptions.includes(v.type), v.id);
  });
}
test('rankTypes: nhiều giá trị → bar trước; ít giá trị → column; chỉ số tỷ lệ → line trước, khối lượng → area trước; share → donut', () => {
  const opts = ['clusteredColumnChart', 'clusteredBarChart', 'stackedColumnChart', 'stackedBarChart', 'lineChart', 'areaChart'];
  assert.strictEqual(P.rankTypes({ role: 'compare', typeOptions: opts, distinct: 14, measure: 'Sales' })[0], 'clusteredBarChart');
  assert.strictEqual(P.rankTypes({ role: 'compare', typeOptions: opts, distinct: 4, measure: 'Sales' })[0], 'clusteredColumnChart');
  assert.strictEqual(P.rankTypes({ role: 'trend', typeOptions: opts, distinct: 48, measure: 'Margin %' })[0], 'lineChart');
  assert.strictEqual(P.rankTypes({ role: 'trend', typeOptions: opts, distinct: 48, measure: 'Quantity' })[0], 'areaChart');
  assert.strictEqual(P.rankTypes({ role: 'share', typeOptions: ['pieChart', 'donutChart'], distinct: 4 })[0], 'donutChart');
});
