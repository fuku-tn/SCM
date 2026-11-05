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

fs.writeFileSync(path.join(stageDir, 'business-goal.md'), md, 'utf8');
const report = ['# Kiểm tra cấu trúc Business Goal', '', `- Số mục (heading): ${headings.length}`, `- Độ dài: ${md.length} ký tự`, '', '| Mục bắt buộc | Có |', '|---|---|', ...rows.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌ thiếu'} |`), ''].join('\n');
fs.writeFileSync(path.join(stageDir, 'business-goal-check.md'), report, 'utf8');
console.log(`business-goal.md đã lưu (${md.length} ký tự, ${headings.length} mục).`);
if (missing.length) console.log('⚠ Thiếu mục: ' + missing.map((m) => m.name).join(', '));
else console.log('✅ Đủ các mục bắt buộc.');
