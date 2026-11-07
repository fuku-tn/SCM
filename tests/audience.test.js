const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../lib/audience.js');

test('parseYears: nhiều cách viết', () => {
  assert.strictEqual(A.parseYears('3 năm 6 tháng'), 3.5);
  assert.strictEqual(A.parseYears('18 tháng'), 1.5);
  assert.strictEqual(A.parseYears('2,5 năm'), 2.5);
  assert.strictEqual(A.parseYears('5'), 5);
  assert.strictEqual(A.parseYears('chưa rõ'), null);
  assert.strictEqual(A.parseYears(''), null);
});

test('tierOf: ánh xạ level', () => {
  assert.strictEqual(A.tierOf('C-level (CEO/CFO/COO...)'), 'executive');
  assert.strictEqual(A.tierOf('Director'), 'executive');
  assert.strictEqual(A.tierOf('Senior Manager'), 'manager');
  assert.strictEqual(A.tierOf('Team Lead'), 'manager');
  assert.strictEqual(A.tierOf('Senior'), 'analyst');
  assert.strictEqual(A.tierOf('Fresher'), 'entry');
  assert.strictEqual(A.tierOf(''), 'manager');
});

test('audienceProfile: KPI luôn trong 4–6', () => {
  for (const lv of ['Intern / Thực tập', 'Junior', 'Middle', 'Senior', 'Team Lead', 'Manager', 'Director', 'C-level (CEO)', '']) {
    const p = A.audienceProfile({ level: lv, tenureCompany: '3 năm' });
    assert.ok(p.kpiPerPage[0] >= 4 && p.kpiPerPage[1] <= 6 && p.kpiPerPage[0] <= p.kpiPerPage[1], lv);
  }
});

test('thâm niên < 1 năm → thêm chú thích', () => {
  const p = A.audienceProfile({ level: 'Manager', tenureCompany: '6 tháng' });
  assert.ok(p.rules.some((r) => /chú thích/.test(r)));
});

test('checkDashboard: cảnh báo vượt trang / KPI', () => {
  const w = A.checkDashboard({ level: 'Director' }, [{ name: 'P1', kpis: 6, visuals: 12 }, { name: 'P2', kpis: 4, visuals: 5 }, { name: 'P3', kpis: 4, visuals: 5 }, { name: 'P4', kpis: 4, visuals: 5 }]);
  assert.ok(w.some((x) => /tối đa 3 trang/.test(x)));
  assert.ok(w.some((x) => /6 thẻ KPI/.test(x)));
  assert.ok(w.some((x) => /12 biểu đồ/.test(x)));
});

test('profileMarkdown có nhóm người xem và luật cứng 4–6', () => {
  const md = A.profileMarkdown({ level: 'Manager' });
  assert.match(md, /Quản lý/); assert.match(md, /4–6/);
});
