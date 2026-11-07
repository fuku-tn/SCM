'use strict';
/**
 * Evaluator độc lập cho từng chặng (cổng kiểm chứng).
 *  - Tiêu chí nghiệm thu (AC) nằm trong skills/<chặng>/assets/evaluator.md, giữa <!-- AC-BEGIN --> và <!-- AC-END -->.
 *    Dòng AC:  "- AC1 [C] nội dung"   ([C] = critical: trượt thì FAIL; không có [C] = minor: chỉ ghi chú).
 *  - Evaluator là một lượt gọi model RIÊNG, chỉ đọc (không công cụ), không viết lại kết quả — chỉ chấm.
 *  - Trả JSON:  {"verdict":"PASS|FAIL","score":0-100,"criteria":[{"id","pass","note"}],"feedback":"..."}
 *  - verdict cuối cùng do CODE quyết định từ criteria (không tin trường verdict của model): FAIL nếu có AC [C] trượt.
 */
const fs = require('fs');
const path = require('path');

const rd = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const cap = (s, n) => (s.length > n ? s.slice(0, n) + `\n…(cắt bớt ${s.length - n} ký tự)` : s);

/** Đọc danh sách AC của một chặng */
function loadAC(skillsDir, stageId) {
  const t = rd(path.join(skillsDir, stageId, 'assets', 'evaluator.md'));
  const m = t.match(/<!--\s*AC-BEGIN\s*-->([\s\S]*?)<!--\s*AC-END\s*-->/);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split(/\r?\n/)) {
    const k = line.match(/^\s*[-*]\s*(AC\d+)\s*(\[C\])?\s*[:.\-–]?\s*(.+)$/i);
    if (k) out.push({ id: k[1].toUpperCase(), critical: !!k[2], text: k[3].trim() });
  }
  return out;
}

/** Gom bằng chứng (file đã sinh) cho evaluator, có giới hạn kích thước */
function gatherEvidence(runDir, stageIdx, stageIds, opts = {}) {
  const sd = path.join(runDir, stageIds[stageIdx]);
  const parts = [];
  const add = (title, text, n = 30000) => { if (text && text.trim()) parts.push(`## ${title}\n${cap(text, n)}`); };
  const handoff = (opts.handoffFiles || []);
  const input = (() => { try { return JSON.parse(rd(path.join(runDir, 'run.json'))).form || {}; } catch { return {}; } })();

  // Ngữ cảnh người dùng (để chấm "bám yêu cầu")
  const a = input.audience || {};
  add('Yêu cầu của người dùng', [
    'Yêu cầu phân tích: ' + (input.requirement || '(trống)'),
    'Người xem: ' + [a.department, a.position, a.level, a.tenureCompany].filter(Boolean).join(' · '),
    'Key Metrics đã chọn: ' + ((input.metrics || []).join(', ') || '(không)'),
    'Dimension đã chọn: ' + ((input.dimensions || []).join(', ') || '(không)'),
    'Kỳ so sánh: ' + ((input.periods || []).join(', ') || '(không)'),
    'Template: ' + (input.template || '(không)'),
  ].join('\n'), 4000);
  if (opts.audienceMd) add('Hồ sơ người xem (tính bằng code)', opts.audienceMd, 3000);

  if (stageIdx <= 1) add('PHÁT HIỆN TỪ DỮ LIỆU (EDA — nguồn sự thật cho mã F#)', rd(path.join(runDir, '00-input', 'eda', 'eda.md')), 14000);
  if (stageIdx === 1) add('Kết quả chặng 1 (Business Goal)', rd(path.join(runDir, stageIds[0], 'result.md')), 12000);
  if (stageIdx >= 2) {
    const chk = (() => { try { return JSON.parse(rd(path.join(runDir, stageIds[2], 'data-checks.json'))); } catch { return null; } })();
    if (chk && stageIdx !== 2) add('Tóm tắt dữ liệu đã làm sạch', chk.tables.map((t) => `### ${t.name} (${t.rowsAfter} dòng)\n` + t.columns.map((c) => `- ${c.name}: ${c.type}, trống ${c.nulls}, distinct ${c.distinct}`).join('\n')).join('\n'), 8000);
  }
  if (stageIdx === 2 && fs.existsSync(path.join(sd, 'data-checks.json'))) {
    const chk = (() => { try { return JSON.parse(rd(path.join(sd, 'data-checks.json'))); } catch { return null; } })();
    if (chk) add('data-checks.json (rút gọn)', JSON.stringify({ tables: chk.tables.map((t) => ({ name: t.name, rowsBefore: t.rowsBefore, rowsAfter: t.rowsAfter, rules: t.rules, actions: t.actions })), relationships: chk.relationships }, null, 1), 16000);
  }
  if (stageIdx === 3) {
    add('Kết quả chặng 1 (Business Goal) — rút gọn', rd(path.join(runDir, stageIds[0], 'result.md')), 6000);
    add('Chặng 2: measures.json (danh sách measure hợp lệ)', rd(path.join(runDir, stageIds[1], 'measures.json')), 8000);
    add('Chặng 3: model-spec.json (bảng/quan hệ hợp lệ)', rd(path.join(runDir, stageIds[2], 'model-spec.json')), 8000);
  }
  if (stageIdx === 2) add('Kết quả chặng 2 — metrics-spec.json (cột được yêu cầu)', rd(path.join(runDir, stageIds[1], 'metrics-spec.json')), 6000);

  // Sản phẩm của chính chặng
  add(`KẾT QUẢ CẦN CHẤM: ${stageIds[stageIdx]}/result.md`, rd(path.join(sd, 'result.md')), 40000);
  for (const f of handoff) add(`${stageIds[stageIdx]}/${f}`, rd(path.join(sd, f)), 16000);
  for (const f of opts.extraFiles || []) add(`${stageIds[stageIdx]}/${f}`, rd(path.join(sd, f)), 10000);
  // log script
  const pre = rd(path.join(sd, 'pre.log')), post = rd(path.join(sd, 'post.log'));
  if (pre) add('Log pre.js (đuôi)', pre.slice(-3000), 3000);
  if (post) add('Log post.js (đuôi)', post.slice(-4000), 4000);
  return parts.join('\n\n');
}

function buildEvalPrompt({ stageName, stageIdx, ac, evidence, attempt }) {
  return [
    '# VAI TRÒ',
    `Bạn là EVALUATOR ĐỘC LẬP, nghiêm khắc, chỉ ĐỌC và CHẤM chặng ${stageIdx + 1} "${stageName}" (lần chạy thứ ${attempt}). Bạn KHÔNG viết lại kết quả, KHÔNG sửa, KHÔNG khen chung chung.`,
    'Chấm từng tiêu chí nghiệm thu (AC) bằng bằng chứng CỤ THỂ trích từ kết quả (tên cột, mã, con số). Không đủ bằng chứng = trượt. Số liệu/tên không có trong dữ liệu hoặc EDA = bịa = trượt.',
    '',
    '# TIÊU CHÍ NGHIỆM THU (AC)',
    ac.map((c) => `- ${c.id}${c.critical ? ' [CRITICAL]' : ' [minor]'}: ${c.text}`).join('\n'),
    '',
    '# BẰNG CHỨNG',
    evidence,
    '',
    '# ĐỊNH DẠNG TRẢ LỜI',
    'Chỉ trả về MỘT khối JSON hợp lệ (không giải thích ngoài JSON, không bọc ```):',
    '{"score": <0-100>, "criteria": [{"id": "AC1", "pass": true|false, "note": "bằng chứng ngắn, dưới 200 ký tự"}], "feedback": "Danh sách việc CẦN SỬA, ngắn gọn, đánh số, nói rõ sửa ở đâu (để model sinh lại làm theo). Để trống nếu mọi AC đạt."}',
    `Phải có đúng ${ac.length} phần tử trong "criteria", cùng id với danh sách AC.`,
  ].join('\n');
}

/** Phân tích câu trả lời của evaluator → { verdict, score, criteria, feedback, failedCritical, parseError? } */
function parseVerdict(text, ac) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  let j = null;
  if (a >= 0 && b > a) { try { j = JSON.parse(s.slice(a, b + 1)); } catch { j = null; } }
  if (!j || !Array.isArray(j.criteria)) return { verdict: 'ERROR', score: null, criteria: [], feedback: '', failedCritical: [], parseError: 'Evaluator không trả JSON hợp lệ' };
  const byId = new Map(j.criteria.map((c) => [String(c.id || '').toUpperCase(), c]));
  const criteria = ac.map((c) => {
    const r = byId.get(c.id);
    // thiếu tiêu chí trong câu trả lời = coi như không chứng minh được → trượt
    return { id: c.id, critical: c.critical, text: c.text, pass: r ? r.pass === true : false, note: r ? String(r.note || '').slice(0, 300) : '(evaluator không chấm tiêu chí này)' };
  });
  const failedCritical = criteria.filter((c) => c.critical && !c.pass).map((c) => c.id);
  const passN = criteria.filter((c) => c.pass).length;
  const score = Number.isFinite(+j.score) ? Math.max(0, Math.min(100, Math.round(+j.score))) : Math.round((passN / Math.max(1, criteria.length)) * 100);
  let feedback = String(j.feedback || '').trim();
  if (failedCritical.length && !feedback) feedback = criteria.filter((c) => !c.pass).map((c, i) => `${i + 1}. ${c.id}: ${c.note}`).join('\n');
  return { verdict: failedCritical.length ? 'FAIL' : 'PASS', score, criteria, feedback, failedCritical };
}

function toMarkdown(ev, stageName) {
  const L = [`# Đánh giá độc lập — ${stageName}`, '', `- Kết luận: **${ev.verdict}** · điểm ${ev.score ?? '—'}/100 · lần chạy ${ev.attempt}${ev.model ? ' · model ' + ev.model : ''}`, '', '| AC | Mức | Đạt | Ghi chú |', '|---|---|---|---|'];
  for (const c of ev.criteria || []) L.push(`| ${c.id} | ${c.critical ? 'critical' : 'minor'} | ${c.pass ? '✅' : '❌'} | ${String(c.note || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
  if (ev.feedback) L.push('', '## Cần sửa', ev.feedback);
  if (ev.history && ev.history.length > 1) L.push('', '## Lịch sử các lần', ...ev.history.map((h) => `- Lần ${h.attempt}: ${h.verdict} (${h.score ?? '—'}/100)${h.failed && h.failed.length ? ' — trượt: ' + h.failed.join(', ') : ''}`));
  return L.join('\n') + '\n';
}

module.exports = { loadAC, gatherEvidence, buildEvalPrompt, parseVerdict, toMarkdown };
