'use strict';
/**
 * File mẫu (.docx) cho người dùng tải về điền + bộ đọc lại các file đó.
 *   - business-context.docx : ngữ cảnh doanh nghiệp + yêu cầu phân tích (2 phần)
 *   - audience-direct.docx  : hồ sơ người xem TRỰC TIẾP (bắt buộc)
 *   - audience-indirect.docx: bảng nhiều người xem GIÁN TIẾP (không bắt buộc)
 * .docx tạo thẳng bằng adm-zip (không cần thư viện Word).
 */
const AdmZip = require('adm-zip');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noDia = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- tạo docx
const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 22}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (runs, o = {}) => `<w:p><w:pPr><w:spacing w:before="${o.before ?? 60}" w:after="${o.after ?? 60}"/></w:pPr>${runs}</w:p>`;
const H1 = (t) => para(run(t, { b: 1, sz: 32, color: '0D1726' }), { before: 240, after: 120 });
const H2 = (t) => para(run(t, { b: 1, sz: 26, color: '8A6D2B' }), { before: 200, after: 80 });
const NOTE = (t) => para(run(t, { i: 1, sz: 20, color: '6B7280' }));
const FIELD = (label, hint) => para(run(label + ': ', { b: 1 }) + run(hint || '', { color: '9CA3AF', i: 1 }));
const cell = (t, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${o.w || 1500}" w:type="dxa"/>${o.head ? '<w:shd w:val="clear" w:color="auto" w:fill="EDE6D6"/>' : ''}</w:tcPr>${para(run(t, { b: o.head, sz: 20 }), { before: 40, after: 40 })}</w:tc>`;
const TABLE = (head, rows, widths) => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="BFC4CA"/>`).join('')}</w:tblBorders></w:tblPr>` +
  `<w:tr>${head.map((h, i) => cell(h, { head: 1, w: widths[i] })).join('')}</w:tr>` + rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, { w: widths[i] })).join('')}</w:tr>`).join('') + '</w:tbl>' + para('');

function makeDocx(bodyXml) {
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  z.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  z.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="${bodyXml.includes('<w:tbl>') ? 16838 : 11906}" w:h="${bodyXml.includes('<w:tbl>') ? 11906 : 16838}"${bodyXml.includes('<w:tbl>') ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`));
  return z.toBuffer();
}

const GENDERS = ['Nam', 'Nữ', 'Khác / không muốn nêu'];
const EDUCATIONS = ['THPT', 'Trung cấp / Cao đẳng', 'Đại học', 'Thạc sĩ / MBA', 'Tiến sĩ'];
const LEVEL_HINT = 'Intern, Fresher, Junior, Middle, Senior, Team Lead, Supervisor, Manager, Senior Manager, Director, C-level';

const MARK_REQ = 'PHẦN 2 — YÊU CẦU PHÂN TÍCH';

function businessContextDocx() {
  return makeDocx([
    H1('Business Context — Mẫu điền'),
    NOTE('Điền vào phần sau dấu hai chấm (xóa chữ gợi ý màu xám). Phần nào chưa có thông tin có thể để trống. Giữ nguyên hai tiêu đề lớn "PHẦN 1" và "PHẦN 2" — BIE dựa vào đó để tách ngữ cảnh và yêu cầu khi bạn tải lên.'),
    H2('PHẦN 1 — NGỮ CẢNH CÔNG TY'),
    FIELD('Tên doanh nghiệp / lĩnh vực', 'VD: Chuỗi bán lẻ thời trang ABC'),
    FIELD('Quy mô', 'VD: 20 cửa hàng, ~300 nhân sự, doanh thu ~50 tỷ/năm'),
    FIELD('Cách doanh nghiệp tạo doanh thu', 'VD: bán lẻ tại cửa hàng 70%, online 30%'),
    FIELD('Khách hàng / thị trường chính', 'VD: nữ 22–35 tuổi tại các thành phố lớn'),
    FIELD('Tình hình hiện tại', 'VD: doanh thu tăng nhưng lợi nhuận gộp giảm 3 quý liên tiếp'),
    FIELD('Bối cảnh ngành / sự kiện đáng chú ý', 'VD: mùa cao điểm Tết, cạnh tranh giá từ sàn TMĐT'),
    FIELD('Thuật ngữ nội bộ cần giải thích', 'VD: "SSSG" = tăng trưởng doanh số cùng cửa hàng'),
    H2(MARK_REQ),
    FIELD('Mục tiêu muốn đạt', 'VD: tăng lợi nhuận gộp 2 điểm % trong 6 tháng'),
    FIELD('Các câu hỏi cần trả lời', 'VD: cửa hàng nào kéo giảm lợi nhuận? nhóm hàng nào tăng trưởng chậm?'),
    FIELD('Quyết định sẽ đưa ra từ dashboard', 'VD: đóng/mở cửa hàng, điều chỉnh khuyến mại'),
    FIELD('Phạm vi (thời gian, khu vực, sản phẩm)', 'VD: 2022–2024, toàn quốc, mọi nhóm hàng'),
    FIELD('Tiêu chí thành công', 'VD: xem được tình hình cả công ty trong 1 phút'),
    FIELD('Điều cần tránh', 'VD: không cần chi tiết từng hóa đơn'),
  ].join(''));
}

function audienceDirectDocx() {
  return makeDocx([
    H1('Hồ sơ người xem TRỰC TIẾP (Direct) — Mẫu điền'),
    NOTE('Người trực tiếp đọc và ra quyết định từ dashboard — BẮT BUỘC. Điền sau dấu hai chấm. BIE đọc các dòng "Nhãn: giá trị" để điền sẵn form; phần ghi chú tự do được đưa nguyên vào phân tích.'),
    H2('Thông tin cơ bản'),
    FIELD('Họ tên (không bắt buộc)', ''),
    FIELD('Phòng ban', 'VD: Kinh doanh'),
    FIELD('Vị trí công việc hiện tại', 'VD: Trưởng nhóm bán hàng'),
    FIELD('Level', LEVEL_HINT),
    FIELD('Giới tính', GENDERS.join(' / ')),
    FIELD('Học vấn', EDUCATIONS.join(' / ')),
    FIELD('Thâm niên tại doanh nghiệp hiện tại', 'VD: 3 năm 6 tháng'),
    FIELD('Thâm niên kể từ khi đi làm', 'VD: 8 năm'),
    H2('Ghi chú về người đọc (tự do)'),
    FIELD('Thường đọc báo cáo bằng', 'VD: laptop trong họp giao ban / điện thoại'),
    FIELD('Mức quen thuộc với số liệu', 'VD: quen Excel, chưa quen thống kê'),
    FIELD('Điều họ quan tâm nhất', 'VD: cửa hàng nào đang tụt so với kế hoạch'),
    FIELD('Điều họ không thích', 'VD: quá nhiều màu, biểu đồ tròn'),
    FIELD('Ghi chú khác', ''),
  ].join(''));
}

function audienceIndirectDocx() {
  const blank = () => ['', '', '', '', '', '', '', '', ''];
  return makeDocx([
    H1('Hồ sơ người xem GIÁN TIẾP (Indirect) — Mẫu điền'),
    NOTE('Những người không trực tiếp dùng dashboard nhưng nhận kết quả hoặc bị ảnh hưởng (sếp của người xem, phòng ban liên quan, khách hàng nội bộ…). KHÔNG bắt buộc. Mỗi hàng là một người hoặc một nhóm; thêm hàng tùy ý. Giữ nguyên hàng tiêu đề để BIE điền sẵn form.'),
    TABLE(['Họ tên / nhóm', 'Phòng ban', 'Vị trí', 'Level', 'Giới tính', 'Học vấn', 'Thâm niên tại DN', 'Thâm niên đi làm', 'Họ cần gì từ dashboard'], [['VD: Giám đốc Kinh doanh', 'Kinh doanh', 'Giám đốc', 'Director', 'Nam', 'Thạc sĩ / MBA', '6 năm', '15 năm', 'Xem nhanh doanh thu & rủi ro'], blank(), blank(), blank()], [2000, 1500, 1500, 1300, 1000, 1700, 1300, 1300, 3000]),
    NOTE(`Level: ${LEVEL_HINT}. Giới tính: ${GENDERS.join(' / ')}. Học vấn: ${EDUCATIONS.join(' / ')}. Có thể viết thêm ghi chú tự do bên dưới bảng.`),
  ].join(''));
}

const SAMPLES = {
  'business-context': { file: 'Business-Context-mau.docx', build: businessContextDocx },
  'audience-direct': { file: 'Nguoi-xem-Direct-mau.docx', build: audienceDirectDocx },
  'audience-indirect': { file: 'Nguoi-xem-Indirect-mau.docx', build: audienceIndirectDocx },
};

// ---------------------------------------------------------------- đọc docx / md → khối
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const pText = (p) => decodeXml(p.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').match(/<w:t[ >][^<]*<\/w:t>|<w:t\/>|\t|\n/g)?.map((m) => (m === '\t' || m === '\n' ? m : m.replace(/<[^>]+>/g, ''))).join('') || '');

/** docx → { text, tables:[ [ [cell,...],... ] ] } ; bảng hiện trong text dưới dạng "a | b | c" */
function docxBlocks(buf) {
  const xml = new AdmZip(buf).readAsText('word/document.xml');
  if (!xml) throw new Error('File .docx không hợp lệ');
  const lines = [], tables = [];
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const rows = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => c[0].split('</w:p>').map(pText).join(' ').replace(/\s+/g, ' ').trim()));
    tables.push(rows); return `<w:p><w:r><w:t>@@TABLE${tables.length - 1}@@</w:t></w:r></w:p>`;
  });
  for (const p of body.split('</w:p>')) {
    const t = pText(p).replace(/[ \t]+$/g, ''); if (!t.trim()) continue;
    const m = t.match(/^@@TABLE(\d+)@@$/);
    if (m) tables[+m[1]].forEach((r) => lines.push(r.join(' | '))); else lines.push(t);
  }
  return { text: lines.join('\n'), tables };
}
/** Markdown / text → bảng dạng pipe */
function mdTables(text) {
  const tables = []; let cur = null;
  for (const l of String(text).split(/\r?\n/)) {
    if (/^\s*\|.*\|\s*$/.test(l)) { if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; (cur = cur || []).push(l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); }
    else if (cur) { tables.push(cur); cur = null; }
  }
  if (cur) tables.push(cur);
  return tables;
}

// ---------------------------------------------------------------- map nhãn → field
const FIELD_KEYS = [
  ['department', /^(phong ban|bo phan|department)$/],
  ['position', /^(vi tri( cong viec)?( hien tai)?|chuc vu|position|job title)$/],
  ['level', /^(level|cap bac|cap do)$/],
  ['gender', /^(gioi tinh|gender)$/],
  ['education', /^(hoc van|trinh do( hoc van)?|education)$/],
  ['tenureCompany', /^(tham nien (tai )?(doanh nghiep|cong ty)( hien tai)?|tham nien tai dn)$/],
  ['tenureCareer', /^(tham nien (ke tu khi di lam|di lam|nghe|nghe nghiep)|tham nien di lam)$/],
  ['name', /^(ho ten|ten|name)( \(khong bat buoc\))?$/],
];
const keyOf = (label) => { const n = noDia(label).replace(/ khong bat buoc$/, ''); const f = FIELD_KEYS.find(([, re]) => re.test(n)); return f ? f[0] : null; };
// Giá trị còn là chữ gợi ý của file mẫu (VD: …, danh sách lựa chọn, dấu chấm/gạch) = chưa điền
const clean = (v) => { v = String(v || '').trim(); return !v || /^(vd\b|ví dụ|e\.g)/i.test(v) || /^(\.{2,}|…|_+|-+)$/.test(v) || /^(Intern, Fresher|Nam \/ Nữ|THPT \/)/.test(v) ? '' : v; };
function matchOption(v, opts) { const n = noDia(v); return opts.find((o) => noDia(o) === n) || opts.find((o) => n && (noDia(o).includes(n) || n.includes(noDia(o).split(' ')[0]))) || ''; }

function normPerson(o) {
  const p = { ...o };
  if (p.gender) p.gender = matchOption(p.gender, GENDERS) || p.gender;
  if (p.education) p.education = matchOption(p.education, EDUCATIONS) || p.education;
  return p;
}

/** DIRECT: các dòng "Nhãn: giá trị" → object; phần còn lại là ghi chú */
function parseDirect(text) {
  const f = {}, notes = [];
  for (const l of String(text).split(/\r?\n/)) {
    const m = l.replace(/^[\s*\-•]+/, '').match(/^([^:|]{2,70}):\s*(.*)$/);
    if (!m) continue;
    const k = keyOf(m[1]);
    if (k) { const v = clean(m[2]); if (v) f[k] = v; } else { const v = clean(m[2]); if (v) notes.push(`${m[1].trim()}: ${v}`); }
  }
  return { fields: normPerson(f), notes };
}
/** INDIRECT: bảng (hàng tiêu đề + các hàng) → mảng người */
function parseIndirect(tables) {
  const out = [];
  for (const t of tables) {
    if (!t.length) continue;
    const head = t[0].map(keyOf);
    const needKey = (h) => h || null;
    if (head.filter(needKey).length < 2) continue;
    const noteCol = t[0].findIndex((h, i) => !head[i] && /(can gi|ghi chu|note|quan tam)/.test(noDia(h)));
    for (const row of t.slice(1)) {
      if (/^(vd\b|ví dụ)/i.test(String(row[0] || '').trim())) continue; // hàng ví dụ của file mẫu
      const p = {};
      head.forEach((k, i) => { if (k) { const v = clean(row[i]); if (v) p[k] = v; } });
      if (noteCol >= 0) { const v = clean(row[noteCol]); if (v) p.note = v; }
      if (Object.keys(p).length) out.push(normPerson(p));
    }
  }
  return out;
}

module.exports = { SAMPLES, GENDERS, EDUCATIONS, MARK_REQ, docxBlocks, mdTables, parseDirect, parseIndirect, noDia };
