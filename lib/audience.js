'use strict';
/**
 * Hồ sơ người xem dashboard — TÍNH BẰNG CODE (không để model tự đoán).
 * Từ level + thâm niên + vị trí → "độ cao" của dashboard (altitude), số KPI/trang mong đợi,
 * độ chi tiết, ngôn ngữ. Dùng ở 2 nơi:
 *   - server.js: chèn vào prompt mọi chặng (mục "HỒ SƠ NGƯỜI XEM")
 *   - skills/04-dashboard-pbip/scripts/post.js: cảnh báo khi dashboard lệch hồ sơ
 * Giới hạn cứng của dự án (CLAUDE.md): mỗi trang 4–6 thẻ KPI.
 */

/** "3 năm 6 tháng" / "18 tháng" / "2.5 năm" / "5" → số năm (null nếu không đọc được) */
function parseYears(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).toLowerCase().replace(',', '.');
  if (!/\d/.test(t)) return null;
  const y = t.match(/(\d+(?:\.\d+)?)\s*(năm|nam|y|yr|year)/), m = t.match(/(\d+(?:\.\d+)?)\s*(tháng|thang|m\b|month)/);
  if (y || m) return (y ? parseFloat(y[1]) : 0) + (m ? parseFloat(m[1]) / 12 : 0);
  const n = t.match(/\d+(?:\.\d+)?/); return n ? parseFloat(n[0]) : null;
}

const TIERS = {
  executive: { altitude: 'Chiến lược', pages: [2, 3], kpi: [4, 4], detail: 'tóm lược', drill: 'rất ít',
    rules: ['Mở đầu bằng 4 KPI sống còn + so sánh kỳ trước (▲▼ %), mỗi KPI đối chiếu mục tiêu nếu có.', 'Tối đa 3 trang; không bảng chi tiết dài; ưu tiên biểu đồ xu hướng và xếp hạng Top/Bottom 5.', 'Chỉ nêu "điều gì thay đổi và vì sao quan trọng"; tránh thuật ngữ kỹ thuật, chú thích ngắn.', 'Ngoại lệ (anomaly) hiện bằng màu cảnh báo, không bắt người xem tự tìm.'] },
  manager: { altitude: 'Quản lý', pages: [3, 5], kpi: [4, 5], detail: 'vừa phải', drill: 'theo chiều quản lý',
    rules: ['Trang 1: 4–5 KPI tổng quan + xu hướng; các trang sau phân tích theo chiều (khu vực, nhóm, đội).', 'Cho phép drill từ tổng quan xuống nhóm/đội; có bảng xếp hạng đội/khu vực để ra quyết định phân bổ nguồn lực.', 'Có so sánh kỳ (MoM/YoY) và chênh lệch so với mục tiêu.', 'Giải thích chỉ số bằng ngôn ngữ vận hành, không công thức.'] },
  analyst: { altitude: 'Phân tích', pages: [4, 8], kpi: [5, 6], detail: 'chi tiết', drill: 'nhiều tầng',
    rules: ['Cho phép tối đa 6 KPI/trang và nhiều trang chuyên sâu theo chiều/độ đo.', 'Có bảng/ma trận chi tiết, phân phối, tương quan để khám phá nguyên nhân.', 'Có thể dùng thuật ngữ chuyên môn; ghi rõ định nghĩa measure ở chú thích.', 'Bộ lọc (slicer) đa chiều để tự khám phá.'] },
  entry: { altitude: 'Vận hành', pages: [2, 4], kpi: [4, 5], detail: 'hướng dẫn', drill: 'ít',
    rules: ['Dùng ngôn ngữ đơn giản, mỗi biểu đồ có tiêu đề nói rõ "đang xem cái gì".', 'Ít bộ lọc, mặc định hợp lý; tránh biểu đồ phức tạp (scatter, waterfall nhiều tầng).', 'Nhấn vào chỉ số liên quan trực tiếp tới công việc hằng ngày của vị trí.', 'Thêm chú thích cách đọc ngắn gọn cho chỉ số chính.'] },
};

function tierOf(level) {
  const l = String(level || '').toLowerCase();
  if (/c-level|ceo|cfo|coo|cto|director|giám đốc/.test(l)) return 'executive';
  if (/manager|supervisor|team lead|trưởng/.test(l)) return 'manager';
  if (/senior|middle|\bmid\b/.test(l)) return 'analyst';
  if (/intern|thực tập|fresher|junior/.test(l)) return 'entry';
  return 'manager';
}

/** @param a {department, position, level, tenureCompany, tenureCareer} */
function audienceProfile(a) {
  a = a || {};
  const tier = tierOf(a.level);
  const base = TIERS[tier];
  const tc = parseYears(a.tenureCompany), tk = parseYears(a.tenureCareer);
  const notes = [];
  let kpi = base.kpi.slice(), pages = base.pages.slice(), detail = base.detail;
  // Thâm niên thấp ở doanh nghiệp → cần chú thích nhiều hơn; thâm niên cao → ít giải thích, nhiều so sánh lịch sử
  if (tc !== null && tc < 1) { detail = 'hướng dẫn (mới vào công ty — thêm chú thích định nghĩa chỉ số)'; notes.push('Thâm niên tại công ty < 1 năm: thêm chú thích định nghĩa chỉ số/ngữ cảnh doanh nghiệp, tránh viết tắt nội bộ.'); }
  else if (tc !== null && tc >= 5) notes.push('Thâm niên ≥ 5 năm tại công ty: đã quen nghiệp vụ → ít giải thích, ưu tiên so sánh nhiều kỳ và điểm bất thường.');
  if (tk !== null && tk >= 10 && tier !== 'executive') notes.push('Thâm niên nghề ≥ 10 năm: chấp nhận mật độ thông tin cao hơn, có thể thêm 1 trang chuyên sâu.');
  if (tk !== null && tk < 2 && tier !== 'entry') notes.push('Thâm niên nghề < 2 năm: giữ bố cục đơn giản, nhấn mạnh KPI chính.');
  kpi[0] = Math.max(4, kpi[0]); kpi[1] = Math.min(6, kpi[1]); // luật cứng 4–6
  return {
    tier, altitude: base.altitude, department: a.department || '', position: a.position || '', level: a.level || '',
    tenureCompanyYears: tc, tenureCareerYears: tk,
    kpiPerPage: kpi, pages, detail, drill: base.drill, rules: base.rules.concat(notes),
  };
}

function profileMarkdown(a) {
  const p = audienceProfile(a);
  return [
    `- Nhóm người xem: **${p.altitude}** (tính từ level "${p.level || '?'}"${p.tenureCompanyYears !== null ? `, thâm niên công ty ≈ ${p.tenureCompanyYears.toFixed(1)} năm` : ''})`,
    `- Số thẻ KPI mỗi trang mong đợi: **${p.kpiPerPage[0] === p.kpiPerPage[1] ? p.kpiPerPage[0] : p.kpiPerPage.join('–')}** (luật cứng của dự án: 4–6)`,
    `- Số trang mong đợi: **${p.pages[0]}–${p.pages[1]}**`,
    `- Mức chi tiết: ${p.detail}; drill-down: ${p.drill}`,
    '- Quy tắc áp dụng:', ...p.rules.map((r) => '  - ' + r),
  ].join('\n');
}

/** So dashboard đã dựng với hồ sơ. pageStats: [{name, kpis, visuals}] → mảng cảnh báo (chuỗi) */
function checkDashboard(a, pageStats) {
  const p = audienceProfile(a), w = [];
  const n = pageStats.length;
  if (n > p.pages[1]) w.push(`Người xem "${p.altitude}" nên có tối đa ${p.pages[1]} trang, dashboard có ${n}.`);
  if (n < p.pages[0]) w.push(`Người xem "${p.altitude}" thường cần ≥ ${p.pages[0]} trang, dashboard chỉ có ${n}.`);
  pageStats.forEach((s) => {
    if (s.kpis > p.kpiPerPage[1]) w.push(`Trang "${s.name}": ${s.kpis} thẻ KPI, vượt mức ${p.kpiPerPage[1]} phù hợp người xem "${p.altitude}".`);
    if (s.kpis && s.kpis < p.kpiPerPage[0] && s.kpis < 4) w.push(`Trang "${s.name}": chỉ ${s.kpis} thẻ KPI (< ${p.kpiPerPage[0]}).`);
    if (p.tier === 'executive' && s.visuals > 9) w.push(`Trang "${s.name}": ${s.visuals} biểu đồ — quá dày cho người xem cấp chiến lược (khuyến nghị ≤ 9).`);
  });
  return w;
}

module.exports = { parseYears, tierOf, audienceProfile, profileMarkdown, checkDashboard };
