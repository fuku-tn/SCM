// Dọn yếu tố dư thừa của template người dùng: textbox làm tiêu đề cho biểu đồ bị bỏ, biểu đồ vẫn có tiêu đề riêng
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('../lib/pbix-template.js');

function run(id, spec0) {
  const t = T.loadTemplate(id); const model = T.makeModel([{ name: 'Sales', columns: ['Region'] }], [{ name: 'Revenue', table: 'Sales' }]);
  const bind = {};
  for (const p of t.manifest.pages) for (const v of p.visuals) if (v.kind === 'data') {
    const roles = {}; for (const [r, x] of Object.entries(v.roles)) roles[r] = x.kind === 'measure' ? ['Revenue'] : [{ table: 'Sales', column: 'Region' }];
    bind[v.key] = { roles };
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bie-cl-'));
  const res = T.applyTemplate({ template: t, spec: { bind, ...(spec0 || {}) }, model, outReportDir: path.join(out, 'r'), warn: () => {} });
  const vis = []; const pdir = path.join(out, 'r', 'definition', 'pages');
  for (const pid of fs.readdirSync(pdir)) { const vd = path.join(pdir, pid, 'visuals'); if (fs.existsSync(vd)) for (const n of fs.readdirSync(vd)) vis.push(JSON.parse(fs.readFileSync(path.join(vd, n, 'visual.json'), 'utf8'))); }
  fs.rmSync(out, { recursive: true, force: true });
  return { res, vis, man: t.manifest };
}

test('Template HR: textbox tiêu đề của biểu đồ bị dọn, biểu đồ có tiêu đề riêng, tắt được bằng cleanup:false', () => {
  const a = run('hr'), b = run('hr', { cleanup: false });
  assert.ok(a.res.cleaned.length > 0, 'có textbox bị dọn');
  assert.strictEqual(b.res.cleaned.length, 0);
  const tbs = (x) => x.vis.filter((v) => v.visual && v.visual.visualType === 'textbox').length;
  assert.strictEqual(tbs(b) - tbs(a), a.res.cleaned.length);
  // mọi biểu đồ có textbox-tiêu đề bị dọn → có tiêu đề bật
  const titled = a.vis.filter((v) => v.visual && v.visual.visualContainerObjects && v.visual.visualContainerObjects.title).length;
  assert.ok(titled >= a.res.cleaned.filter((c) => /đã có tiêu đề riêng/.test(c.why)).length);
});
test('Textbox có chữ do người dùng đặt (texts) hoặc nằm trong keepAll thì được giữ', () => {
  const a = run('hr'); const key = a.res.cleaned.find((c) => /đã có tiêu đề riêng/.test(c.why)).key;
  const k = run('hr', { keepAll: [key] });
  assert.ok(!k.res.cleaned.some((c) => c.key === key));
  const t = run('hr', { texts: { [key]: 'Tiêu đề của tôi' } });
  assert.ok(!t.res.cleaned.some((c) => c.key === key));
});
