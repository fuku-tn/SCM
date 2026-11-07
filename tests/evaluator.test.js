const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const EV = require('../lib/evaluator.js');
const h = require('./helpers');

const SK = path.join(h.ROOT, 'skills');
const STAGES = ['01-business-goal', '02-key-metrics', '03-data-etl', '04-dashboard-pbip'];

test('Mỗi chặng có evaluator.md với AC hợp lệ và ít nhất 3 AC critical', () => {
  for (const s of STAGES) {
    const ac = EV.loadAC(SK, s);
    assert.ok(ac.length >= 6, s + ': số AC = ' + ac.length);
    assert.ok(ac.filter((c) => c.critical).length >= 3, s + ': thiếu AC critical');
    assert.strictEqual(new Set(ac.map((c) => c.id)).size, ac.length, s + ': trùng mã AC');
  }
});

const AC = [{ id: 'AC1', critical: true, text: 'a' }, { id: 'AC2', critical: true, text: 'b' }, { id: 'AC3', critical: false, text: 'c' }];

test('parseVerdict: PASS khi AC critical đạt, bỏ qua trường verdict của model', () => {
  const v = EV.parseVerdict('Đây là kết quả:\n{"verdict":"FAIL","score":88,"criteria":[{"id":"AC1","pass":true,"note":"ok"},{"id":"AC2","pass":true,"note":"ok"},{"id":"AC3","pass":false,"note":"thiếu"}],"feedback":""}', AC);
  assert.strictEqual(v.verdict, 'PASS'); assert.strictEqual(v.score, 88); assert.deepStrictEqual(v.failedCritical, []);
});

test('parseVerdict: FAIL khi một AC critical trượt, tự dựng feedback nếu thiếu', () => {
  const v = EV.parseVerdict('{"score":40,"criteria":[{"id":"AC1","pass":true},{"id":"AC2","pass":false,"note":"bịa số"},{"id":"AC3","pass":true}]}', AC);
  assert.strictEqual(v.verdict, 'FAIL'); assert.deepStrictEqual(v.failedCritical, ['AC2']);
  assert.match(v.feedback, /AC2/);
});

test('parseVerdict: thiếu tiêu chí trong câu trả lời = trượt', () => {
  const v = EV.parseVerdict('{"score":90,"criteria":[{"id":"AC1","pass":true}]}', AC);
  assert.strictEqual(v.verdict, 'FAIL'); assert.ok(v.failedCritical.includes('AC2'));
});

test('parseVerdict: không phải JSON → ERROR (không chặn chặng)', () => {
  assert.strictEqual(EV.parseVerdict('xin lỗi, tôi không biết', AC).verdict, 'ERROR');
  assert.strictEqual(EV.parseVerdict('{"criteria": "sai"}', AC).verdict, 'ERROR');
  assert.strictEqual(EV.parseVerdict('', AC).verdict, 'ERROR');
});

test('buildEvalPrompt chứa AC, bằng chứng và yêu cầu JSON', () => {
  const p = EV.buildEvalPrompt({ stageName: 'Business Goal', stageIdx: 0, ac: AC, evidence: 'BẰNG CHỨNG X', attempt: 2 });
  assert.match(p, /AC1 \[CRITICAL\]/); assert.match(p, /AC3 \[minor\]/); assert.match(p, /BẰNG CHỨNG X/); assert.match(p, /JSON/); assert.match(p, /lần chạy thứ 2/);
});

test('gatherEvidence: gồm result.md, EDA, log; giới hạn kích thước', () => {
  const d = h.makeRun({ csv: 'a,b\n1,2\n' });
  try {
    h.fs.writeFileSync(h.path.join(d, '01-business-goal', 'result.md'), '# KẾT QUẢ ' + 'x'.repeat(60000));
    h.fs.mkdirSync(h.path.join(d, '00-input', 'eda'), { recursive: true });
    h.fs.writeFileSync(h.path.join(d, '00-input', 'eda', 'eda.md'), '**F1** phát hiện');
    h.fs.writeFileSync(h.path.join(d, '01-business-goal', 'post.log'), 'log post');
    const ev = EV.gatherEvidence(d, 0, STAGES, {});
    assert.match(ev, /F1/); assert.match(ev, /log post/); assert.match(ev, /cắt bớt/);
    assert.ok(ev.length < 70000);
  } finally { h.rm(d); }
});

test('toMarkdown có bảng AC và lịch sử', () => {
  const md = EV.toMarkdown({ verdict: 'FAIL', score: 50, attempt: 2, criteria: [{ id: 'AC1', critical: true, pass: false, note: 'sai | cột' }], feedback: '1. sửa', history: [{ attempt: 1, verdict: 'FAIL', score: 40, failed: ['AC1'] }, { attempt: 2, verdict: 'FAIL', score: 50, failed: ['AC1'] }] }, 'Chặng');
  assert.match(md, /\| AC1 \| critical \| ❌/); assert.match(md, /Lần 1: FAIL/); assert.ok(!/sai \| cột/.test(md));
});
