const { test } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');
const EDA = require('../lib/eda.js');

function dataset() {
  // 24 tháng, Bắc chiếm ~70%, 1 ngoại lệ cực lớn, cột Giá = 2 × Số lượng (tương quan hoàn hảo)
  const rows = [['Mã đơn', 'Ngày', 'Khu vực', 'Doanh thu', 'Số lượng', 'Giá']];
  let id = 1;
  for (let m = 0; m < 24; m++) for (let k = 0; k < 10; k++) {
    const y = 2023 + Math.floor(m / 12), mo = (m % 12) + 1;
    const region = k < 7 ? 'Bắc' : (k < 9 ? 'Nam' : 'Trung');
    const q = 1 + (k % 5);
    rows.push([id++, `${y}-${String(mo).padStart(2, '0')}-${String(1 + k).padStart(2, '0')}`, region, 100 * q + m, q, 2 * q]);
  }
  rows.push([id++, '2024-12-20', 'Bắc', 1000000, 3, 6]);
  return rows.map((r) => r.join(',')).join('\n') + '\n';
}

test('EDA: bắt ngoại lệ, tập trung, xu hướng, tương quan, đánh mã F#', () => {
  const d = h.makeRun({ csv: dataset() });
  try {
    const r = h.etl(d); assert.strictEqual(r.pre.status, 0, r.pre.out);
    const out = h.path.join(d, 'eda');
    const res = EDA.run(h.path.join(d, '03-data-etl', 'clean'), h.path.join(d, '03-data-etl', 'data-checks.json'), out);
    const kinds = new Set(res.findings.map((f) => f.kind));
    for (const k of ['outlier', 'concentration', 'trend', 'time', 'correlation']) assert.ok(kinds.has(k), 'thiếu loại phát hiện: ' + k + ' / có: ' + [...kinds]);
    assert.deepStrictEqual(res.findings.map((f) => f.id), res.findings.map((_, i) => 'F' + (i + 1)), 'mã F# liên tục');
    const conc = res.findings.find((f) => f.kind === 'concentration');
    assert.match(conc.text, /Bắc/);
    const md = h.fs.readFileSync(h.path.join(out, 'eda.md'), 'utf8');
    assert.match(md, /\*\*F1\*\*/);
    assert.ok(h.fs.existsSync(h.path.join(out, 'eda.json')));
  } finally { h.rm(d); }
});

test('EDA: bảng nhỏ / không cột số không làm lỗi', () => {
  const d = h.makeRun({ csv: 'Tên,Nhóm\nA,x\nB,y\n' });
  try {
    h.etl(d);
    const res = EDA.run(h.path.join(d, '03-data-etl', 'clean'), h.path.join(d, '03-data-etl', 'data-checks.json'), h.path.join(d, 'eda'));
    assert.ok(Array.isArray(res.findings));
  } finally { h.rm(d); }
});

test('Chặng 1 post.js: kiểm tra F#, truy vết G→Q→D', () => {
  const d = h.makeRun({ csv: dataset() });
  try {
    h.etl(d); EDA.run(h.path.join(d, '03-data-etl', 'clean'), h.path.join(d, '03-data-etl', 'data-checks.json'), h.path.join(d, '00-input', 'eda'));
    const md = [
      '# Business Goal', '## 1. Tóm tắt doanh nghiệp', 'x', '## 2. Mô hình kinh doanh và bối cảnh ngành', '| P1 | Phụ thuộc miền Bắc | F999 |',
      '## 3. Mục tiêu kinh doanh', '| G1 | Tăng | | | | P1 |', '| G2 | Giảm rủi ro | | | | P1 |',
      '## 4. Câu hỏi kinh doanh', '| Q1 | Vì sao? | G1 | | |', '### 4b. Giả thuyết', '| H1 | gt | F1 | cách | Q1 |',
      '## 5. Người dùng dashboard và quyết định', '| D1 | hành động | Q1 |', '## 6. Phạm vi dữ liệu, giả định', 'x', '## 7. Tiêu chí thành công', 'x', '## 8. Thuật ngữ', 'x'].join('\n');
    h.fs.writeFileSync(h.path.join(d, '01-business-goal', 'result.md'), md);
    const r = h.script('01-business-goal', 'post', d); assert.strictEqual(r.status, 0, r.out);
    assert.match(r.out, /F999/, 'báo mã F# không tồn tại');
    assert.match(r.out, /G2/, 'báo G2 mồ côi');
    const rep = h.fs.readFileSync(h.path.join(d, '01-business-goal', 'business-goal-check.md'), 'utf8');
    assert.match(rep, /Bằng chứng & truy vết/);
  } finally { h.rm(d); }
});
