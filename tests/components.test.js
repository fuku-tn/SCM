const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../lib/components.js');
const TPL = require('../lib/pbix-template.js');

const tpls = TPL.listTemplates();

test('Thư viện chỉ gồm loại biểu đồ có thật trong template, mọi mẫu PASS kiểm tra cơ học', { skip: !tpls.length && 'không có template' }, () => {
  for (const t of tpls) {
    const present = new Set(); TPL.loadTemplate(t.id).manifest.pages.forEach((p) => p.visuals.forEach((v) => v.kind === 'data' && present.add(v.type)));
    const comps = C.extract(t.id);
    assert.ok(comps.length > 0, t.id);
    for (const c of comps) {
      assert.ok(present.has(c.type), `${c.id}: loại ${c.type} không có trong template`);
      assert.deepStrictEqual(C.validateComponent(c), [], c.id);
    }
  }
});

test('instantiate: chỉ tham chiếu trường được gắn, không còn token/Entity cũ, bỏ trường thiếu', { skip: !tpls.length && 'không có template' }, () => {
  const comps = C.extract(tpls[0].id);
  const combo = comps.find((c) => c.type === 'lineClusteredColumnComboChart') || comps.find((c) => c.type === 'lineChart');
  assert.ok(combo);
  const fields = {}; for (const [r, a] of Object.entries(combo.roles)) fields[r] = a.map((s, i) => ({ table: 'Bảng', name: (s.kind === 'measure' ? 'M' : 'C') + r + i }));
  const v = C.instantiate(combo, { name: 'a'.repeat(20), x: 1, y: 2, w: 300, h: 200, fields });
  const s = JSON.stringify(v);
  assert.ok(!/"@/.test(s), 'còn token');
  const entities = new Set([...s.matchAll(/"Entity":"([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual([...entities], ['Bảng']);
  assert.deepStrictEqual(v.position, { x: 1, y: 2, z: 0, height: 200, width: 300, tabOrder: 0 });
  // thiếu trường ở vai trò cuối → vai trò đó bị bỏ, vẫn ra visual hợp lệ
  const partial = { ...fields }; const lastRole = Object.keys(fields).pop(); if (Object.keys(fields).length > 1) delete partial[lastRole];
  const v2 = C.instantiate(combo, { name: 'b'.repeat(20), fields: partial });
  assert.ok(v2 && !JSON.stringify(v2).includes('"@'));
  assert.strictEqual(C.instantiate(combo, { name: 'c'.repeat(20), fields: {} }), null, 'không có trường nào → null');
});

test('normalize: gỡ bộ lọc đã lưu, tooltip, liên kết trang', () => {
  const v = { $schema: 's', name: 'n', position: { x: 0, y: 0, width: 1, height: 1 }, visual: { visualType: 'slicer', query: { queryState: { Values: { projections: [{ field: { Column: { Expression: { SourceRef: { Entity: 'T' } }, Property: 'C' } }, queryRef: 'T.C', nativeQueryRef: 'C' }] } } },
    objects: { general: [{ properties: { filter: { filter: { From: [{ Name: 't', Entity: 'T' }], Where: [] } } } }] },
    visualContainerObjects: { visualTooltip: [{ properties: { section: { expr: { Literal: { Value: "'pg1'" } } } } }] } } };
  const n = C.normalize(v);
  const s = JSON.stringify(n.visual);
  assert.ok(!/Entity/.test(s) && !/visualTooltip/.test(s) && !/"filter"/.test(s), s);
  assert.deepStrictEqual(n.roles, { Values: [{ kind: 'column' }] });
});
