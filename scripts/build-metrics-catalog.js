'use strict';
/**
 * Đọc documents/Business Intelligence Metrics.xlsx → knowledge-base/metrics-catalog.json
 * (danh mục chỉ số BI theo lĩnh vực, nhóm, mô tả, công thức, mức quan trọng, link tham khảo).
 *   node scripts/build-metrics-catalog.js [đường-dẫn-xlsx]
 * Cập nhật file Excel rồi chạy lại lệnh này để làm mới danh mục.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'documents', 'Business Intelligence Metrics.xlsx');
const OUT = path.join(ROOT, 'knowledge-base', 'metrics-catalog.json');

// id + nhãn tiếng Việt cho từng sheet (khớp theo tên sheet, không phân biệt hoa thường)
const DOMAINS = [
  [/sales/i, 'sales', 'Bán hàng', ['kinh doanh', 'bán hàng', 'sales']],
  [/hr|human/i, 'hr', 'Nhân sự', ['nhân sự', 'hr', 'nhan su', 'tuyển dụng']],
  [/finance|accounting/i, 'finance', 'Tài chính – Kế toán', ['tài chính', 'kế toán', 'finance', 'accounting', 'ke toan']],
  [/supply/i, 'supply-chain', 'Chuỗi cung ứng', ['chuỗi cung ứng', 'cung ứng', 'logistics', 'kho', 'mua hàng', 'supply', 'vận hành']],
  [/customer/i, 'customer-product', 'Khách hàng & Sản phẩm', ['khách hàng', 'customer', 'cskh', 'sản phẩm']],
  [/marketing/i, 'digital-marketing', 'Digital Marketing', ['marketing', 'truyền thông', 'quảng cáo']],
  [/product dev/i, 'product-development', 'Phát triển sản phẩm', ['r&d', 'phát triển sản phẩm', 'product', 'sản xuất']],
  [/project/i, 'project-management', 'Quản lý dự án', ['dự án', 'project', 'pmo']],
];
const clean = (s) => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

function build(file) {
  const wb = XLSX.readFile(file);
  const domains = [];
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]; if (!ws || !ws['!ref']) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hit = DOMAINS.find(([re]) => re.test(sn));
    const dom = { id: hit ? hit[1] : clean(sn).toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: clean(sn), label: hit ? hit[2] : clean(sn), match: hit ? hit[3] : [], categories: [] };
    let cat = null; const seen = new Set();
    rows.forEach((r, ri) => {
      if (ri < 2) return;                                   // dòng tiêu đề sheet + tiêu đề cột
      const name = clean(r[0]); if (!name) return;
      const desc = clean(r[3]), formula = clean(r[4]);
      if (!desc && !formula) { cat = { name: name.replace(/\s*Metrics\s*$/i, '').trim(), metrics: [] }; dom.categories.push(cat); return; }
      if (!cat) { cat = { name: 'Khác', metrics: [] }; dom.categories.push(cat); }
      const key = name.toLowerCase(); if (seen.has(key)) return; seen.add(key);
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: 6 })];
      const imp = clean(r[5]); const importance = /high/i.test(imp) ? 'High' : /low/i.test(imp) ? 'Low' : /med/i.test(imp) ? 'Medium' : (imp || 'Medium');
      cat.metrics.push({ id: dom.id + ':' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, description: desc, formula, importance, link: (cell && cell.l && cell.l.Target) || '' });
    });
    dom.categories = dom.categories.filter((c) => c.metrics.length);
    domains.push(dom);
  }
  return { version: 1, source: path.basename(file), generatedAt: new Date().toISOString().slice(0, 10), domains };
}

if (require.main === module) {
  const cat = build(SRC);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(cat, null, 1) + '\n', 'utf8');
  const n = cat.domains.reduce((a, d) => a + d.categories.reduce((b, c) => b + c.metrics.length, 0), 0);
  console.log(`Đã tạo ${path.relative(ROOT, OUT)}: ${cat.domains.length} lĩnh vực, ${n} chỉ số`);
}
module.exports = { build };
