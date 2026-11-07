#!/usr/bin/env node
/**
 * Stage 1 · Business Goal — post.js
 * Chạy SAU lượt trả lời của model.
 *
 *   node post.js <runDir> <stageDir>
 *
 * - Kiểm tra result.md có đủ các mục bắt buộc (theo assets/business-goal-template.md)
 * - Lưu bản dùng lại cho các tác vụ sau:  business-goal.md
 * - Ghi báo cáo kiểm tra:  business-goal-check.md
 * Không làm lỗi chặng khi thiếu mục (chỉ cảnh báo) — exit 0.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const runDir = process.argv[2], stageDir = process.argv[3];
if (!runDir || !stageDir) { console.error('Usage: node post.js <runDir> <stageDir>'); process.exit(2); }
const file = path.join(stageDir, 'result.md');
if (!fs.existsSync(file)) { console.error('Không có result.md'); process.exit(1); }
const md = fs.readFileSync(file, 'utf8');

const REQUIRED = [
  ['Tóm tắt doanh nghiệp', /(tóm tắt|hồ sơ|tổng quan|giới thiệu).{0,30}(doanh nghiệp|công ty)|company profile/i],
  ['Mô hình kinh doanh & ngành', /(mô hình|bối cảnh|ngành|ngữ cảnh)/i],
  ['Mục tiêu kinh doanh', /mục tiêu/i],
  ['Câu hỏi kinh doanh', /câu hỏi/i],
  ['Người dùng dashboard & quyết định', /(người (dùng|xem)|stakeholder).{0,40}|quyết định/i],
  ['Phạm vi dữ liệu & giả định', /(giả định|phạm vi|ràng buộc|hạn chế)/i],
  ['Tiêu chí thành công', /(tiêu chí|thành công|success)/i],
  ['Thuật ngữ', /(thuật ngữ|định nghĩa|glossary)/i],
];
const headings = md.split('\n').filter((l) => /^#{1,4}\s+/.test(l)).map((l) => l.replace(/^#+\s+/, '').trim());
const rows = REQUIRED.map(([name, re]) => ({ name, ok: headings.some((h) => re.test(h)) }));
const missing = rows.filter((r) => !r.ok);

// ---- kiểm tra bằng chứng (EDA) và truy vết G → Q → D ----
const evidence = [];
let edaIds = null;
try { const e = JSON.parse(fs.readFileSync(path.join(runDir, '00-input', 'eda', 'eda.json'), 'utf8')); edaIds = new Set((e.findings || []).map((f) => f.id)); } catch { /* không có EDA */ }
const cited = [...new Set((md.match(/\bF\d+\b/g) || []))];
if (edaIds && edaIds.size) {
  if (!cited.length) evidence.push('Không trích mã phát hiện F# nào từ EDA — vấn đề/mục tiêu chưa dựa trên bằng chứng dữ liệu.');
  const bad = cited.filter((c) => !edaIds.has(c)); if (bad.length) evidence.push('Trích mã F# không tồn tại trong EDA: ' + bad.join(', '));
  if (!/\bH\d+\b/.test(md)) evidence.push('Thiếu giả thuyết H# (mục 4b).');
  if (!/\bP\d+\b/.test(md)) evidence.push('Thiếu vấn đề/cơ hội P# có bằng chứng (mục 2).');
}
const rowsOf = (code) => md.split('\n').filter((l) => new RegExp('^\\|\\s*' + code + '\\d+\\s*\\|').test(l));
const gRows = rowsOf('G'), qRows = rowsOf('Q'), dRows = rowsOf('D');
const idsOf = (rs, code) => rs.map((l) => (l.match(new RegExp('^\\|\\s*(' + code + '\\d+)')) || [])[1]);
const qText = qRows.join('\n'), dText = dRows.join('\n');
idsOf(gRows, 'G').filter((g) => g && !new RegExp('\\b' + g + '\\b').test(qText)).forEach((g) => evidence.push(`Mục tiêu ${g} chưa có câu hỏi Q nào phục vụ.`));
idsOf(qRows, 'Q').filter((q) => q && !new RegExp('\\b' + q + '\\b').test(dText) && !new RegExp('\\b' + q + '\\b').test(md.split('\n').filter((l) => /^\|\s*H\d+/.test(l)).join('\n'))).forEach((q) => evidence.push(`Câu hỏi ${q} chưa có quyết định D (hoặc giả thuyết H) nào dựa vào.`));
if (!gRows.length) evidence.push('Không tìm thấy bảng mục tiêu G# (cột Mã bắt đầu bằng G1, G2…).');

fs.writeFileSync(path.join(stageDir, 'business-goal.md'), md, 'utf8');
const report = ['# Kiểm tra cấu trúc Business Goal', '', `- Số mục (heading): ${headings.length}`, `- Độ dài: ${md.length} ký tự`, `- Mã phát hiện F# được trích: ${cited.length ? cited.join(', ') : '(không có)'}`, '', '| Mục bắt buộc | Có |', '|---|---|', ...rows.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌ thiếu'} |`), '', '## Bằng chứng & truy vết', ...(evidence.length ? evidence.map((e) => '- ⚠ ' + e) : ['- ✅ Bằng chứng F# hợp lệ, truy vết G → Q → D liền mạch.']), ''].join('\n');
fs.writeFileSync(path.join(stageDir, 'business-goal-check.md'), report, 'utf8');
console.log(`business-goal.md đã lưu (${md.length} ký tự, ${headings.length} mục).`);
if (missing.length) console.log('⚠ Thiếu mục: ' + missing.map((m) => m.name).join(', '));
else console.log('✅ Đủ các mục bắt buộc.');
evidence.forEach((e) => console.log('⚠ ' + e));
if (!evidence.length) console.log('✅ Bằng chứng F# và truy vết G→Q→D hợp lệ.');
