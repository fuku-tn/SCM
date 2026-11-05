---
name: dashboard-pbip
title: Dashboard (PBIP)
description: Thiết kế Dashboard theo template mẫu và tiêu chuẩn trực quan IBCS (tổng quan, xu hướng, so sánh, tỷ trọng, phân phối, phân tầng), rồi dựng project Power BI (PBIP) gồm Report + Semantic Model + dữ liệu để mở và chạy được trong Power BI Desktop.
tools: Read
---

# SKILL: Dashboard (PBIP) (Chặng 4)

## Mục đích
Tạo ra **project Power BI (PBIP) hoạt động được** từ kết quả ba chặng trước. Bạn thiết kế (chọn trang, biểu đồ, bố cục theo template + IBCS); **script dựng toàn bộ file PBIP** một cách xác định để project không bị lỗi cú pháp.

Kết quả: `result.md` (thiết kế) + `dashboard-spec.json` (bạn viết) → `scripts/post.js` dựng thư mục `pbip/<Tên>/` + `pbip-validation.md`.

## Cấu trúc SKILL (bắt buộc)
| Thành phần | Nội dung |
|---|---|
| `SKILL.md` | Hướng dẫn này |
| `references/` | `ibcs-standard.md` (tiêu chuẩn trực quan của người dùng), `chart-standards.md`, `dashboard-spec-schema.md`, `pbip-format.md`, `pbir-config.json` |
| `assets/` | `dashboard-spec.example.json`, `result-template.md`, `ibcs/` (13 hình minh họa Trước/Sau) |
| `scripts/` | `post.js` (dựng PBIP), `validate_schema.js` (đối chiếu schema Microsoft) |

## Đầu vào
- Output chặng 1 (mục tiêu G, câu hỏi Q, người xem, phong cách), chặng 2 (measure đã sinh + bảng ghép Measure–Dimension "Phụ lục (h)"), chặng 3 (bảng, quan hệ, cột ngày)
- **Theme màu**: đúng 5 mã người dùng chọn (có trong prompt)
- **Template mẫu**: các file ảnh/PDF được liệt kê trong mục "Template dashboard mẫu" của prompt (thư mục người dùng tải lên **và** thư mục `templates/`)

## Quy trình
1. **Xem template**: dùng công cụ **Read** mở từng file template (đường dẫn tuyệt đối trong prompt). Ghi lại: số trang, vị trí KPI, kiểu biểu đồ, cách chia vùng, tỷ lệ. Lấy làm **cảm hứng bố cục**, không sao chép màu/thương hiệu. Không có template → tự thiết kế theo chuẩn bên dưới.
2. **Đọc** `references/ibcs-standard.md` (bắt buộc áp dụng), `references/chart-standards.md`.
3. **Chọn bộ biểu đồ** — dashboard **phải có**:
   | Nhóm bắt buộc | Biểu đồ |
   |---|---|
   | **Chỉ số tổng quan** | Thẻ KPI (`card`) kèm Delta / Delta % |
   | **Xu hướng** | Cột (chuỗi thời gian ngắn) hoặc Đường (≥ 12–24 kỳ) |
   | **So sánh** | Thanh ngang giảm dần |
   | **Tỷ trọng** | Donut/Pie ≤ 4 phần, 100% xếp chồng, hoặc Treemap |
   | **Phân phối** | *Chỉ khi* phân tích chuyên sâu theo 1 dimension |
   | **Phân tầng** | *Chỉ khi* phân tích chuyên sâu theo 1 dimension |
   "Chuyên sâu theo 1 dimension" = người dùng chỉ chọn 1 Dimension, hoặc yêu cầu nêu rõ (chuyên sâu / deep-dive / chi tiết theo …). Khi đó thêm **một trang riêng** có Phân phối + Phân tầng.
4. **Bố cục lưới 12 × 12** (mỗi ô ≈ 97×50 px trên trang 1280×720): KPI hàng trên cùng; xu hướng và so sánh ở giữa; tỷ trọng/chi tiết ở dưới; slicer ở rìa. Mọi trang cùng khung lưới (thống nhất theo IBCS).
5. **Chỉ dùng measure/cột có thật** (tên đúng từng ký tự trong `measures.json`, `model-spec.json`). Script loại visual tham chiếu sai.
6. **Áp tiêu chuẩn IBCS** trong phạm vi script hỗ trợ (bỏ lưới, ẩn trục giá trị + nhãn trực tiếp, sắp giảm dần, chú giải chỉ khi có nhiều series…); phần chưa tự động được thì **ghi vào mục "Việc cần chỉnh thủ công"** của result.md.
7. **Xuất `dashboard-spec.json`** đúng `references/dashboard-spec-schema.md`.

## Quy tắc
- Theme: 5 màu người dùng chọn được nạp thành theme của báo cáo; mỗi visual lấy màu từ theme. Không tự đặt thêm màu lạ. Xanh `#38A169` / đỏ `#E53E3E` chỉ dành cho Delta thuận lợi / bất lợi.
- Mỗi biểu đồ có tiêu đề nêu **thông điệp** (vd. "Doanh thu tăng 12% so với tháng trước"), đơn vị ghi ở `subtitle`.
- Tối đa 4 phân đoạn mỗi biểu đồ xếp chồng / donut; đường tối đa 3 đường.
- Không dùng 3D, bóng, gradient, viền khung.
- Phong cách và mật độ thông tin theo người xem (level/thâm niên) ở chặng 1.
- Không tự viết file PBIP; **không** xuất khối FILE nào ngoài `dashboard-spec.json`.

## Output
1. **`result.md`** theo `assets/result-template.md`: phân tích template, bảng bố cục (trang → biểu đồ → ô lưới → measure/dimension → nhóm chuẩn), checklist IBCS, việc chỉnh thủ công. Phần "Kết quả dựng PBIP" ở cuối do script tự nối.
2. **Khối file**:
```
<<<FILE: dashboard-spec.json>>>
{ ... }
<<<END FILE>>>
```

## Kết quả cuối (do script tạo trong thư mục chặng)
```
pbip/<Tên>/
  <Tên>.pbip
  <Tên>.Report/            (PBIR: definition.pbir, definition/..., StaticResources/...)
  <Tên>.SemanticModel/     (TMDL: model, expressions, relationships, tables/*.tmdl, Calendar)
  data/*.csv               (dữ liệu đã làm sạch)
  README.md
pbip-validation.md
```
Mở bằng Power BI Desktop: **File → Open → `<Tên>.pbip`**; nếu cần, đặt lại tham số `DataFolder` (xem README trong project).

## Tự kiểm tra
- [ ] Có đủ 4 nhóm bắt buộc (tổng quan, xu hướng, so sánh, tỷ trọng); phân phối + phân tầng nếu chuyên sâu 1 dimension
- [ ] Mọi measure/cột trong spec có trong dữ liệu
- [ ] Bố cục không chồng lấn, nằm trong lưới 12×12
- [ ] Đã xem template (nếu có) và nêu những gì lấy cảm hứng
- [ ] IBCS: bỏ lưới/3D, nhãn trực tiếp, sắp giảm dần, màu Delta đúng nghĩa
