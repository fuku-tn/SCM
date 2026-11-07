---
name: dashboard-pbip
title: Dashboard (PBIP)
description: Dựng project Power BI (PBIP) có giao diện GIỐNG template Power BI mà người dùng chọn (nền, hình, logo, nút chuyển trang, màu, định dạng biểu đồ) và gắn dữ liệu của họ vào các biểu đồ; áp tiêu chuẩn trực quan IBCS và bộ biểu đồ chuẩn.
knowledge: viz-craft, kpi-selection
---

# SKILL: Dashboard (PBIP) (Chặng 4)

## Mục đích
Tạo ra **project Power BI (PBIP) hoạt động được**, trong đó:
- **Giao diện giống hệt template** người dùng chọn (1 trong các file `.pbix` trong thư mục `templates/`): trang, nền, hình, logo, nút chuyển trang, màu theme, định dạng từng biểu đồ — **do script giữ nguyên**.
- **Dữ liệu là của người dùng**: bạn quyết định **gắn measure / cột nào vào biểu đồ nào** của template, thay chữ trong textbox, và bỏ phần không phù hợp.

Kết quả: `result.md` (thiết kế & bảng gắn dữ liệu) + `dashboard-spec.json` (bạn viết) → `scripts/post.js` dựng `pbip/<Tên>/` + `pbip-validation.md`.

## Cấu trúc SKILL (bắt buộc)
| Thành phần | Nội dung |
|---|---|
| `SKILL.md` | Hướng dẫn này |
| `references/` | `template-guide.md` (cách gắn dữ liệu vào template), `ibcs-standard.md`, `chart-standards.md`, `dashboard-spec-schema.md`, `pbip-format.md`, `pbir-config.json` |
| `assets/` | `dashboard-spec.template.example.json`, `dashboard-spec.example.json` (không template), `result-template.md`, `ibcs/` (13 hình minh họa) |
| `scripts/` | `post.js` (dựng PBIP), `validate_schema.js` (đối chiếu schema Microsoft). Logic template dùng chung: `lib/pbix-template.js` |

## Đầu vào (có trong prompt)
- Output chặng 1 (mục tiêu G, câu hỏi Q, người xem), chặng 2 (measure đã sinh + "Phụ lục (h)"), chặng 3 (bảng, quan hệ, cột ngày, tóm tắt dữ liệu đã làm sạch)
- **Mục "TEMPLATE POWER BI ĐÃ CHỌN"**: danh sách trang, biểu đồ dữ liệu (`key`, loại, vai trò dữ liệu, template đang dùng gì), textbox (chữ hiện tại), nút chuyển trang
- Chế độ màu: giữ màu template (mặc định) hoặc 5 màu người dùng (script tự áp)

## Quy trình
1. **Đọc mục TEMPLATE**: hiểu mỗi trang dùng để làm gì (Home / Overview / …) và mỗi biểu đồ dữ liệu "đang kể" điều gì (vd. thẻ KPI, xu hướng theo tháng, tỷ trọng theo nhóm).
2. **Chọn trang giữ lại** (`pages.keep`): giữ trang có thể gắn dữ liệu có ý nghĩa; trang giới thiệu (Home) thường giữ. **Bỏ** trang mà dữ liệu người dùng không đủ (vd. trang Geography khi không có dữ liệu địa lý). Trang Tooltip chỉ giữ khi bạn gắn dữ liệu cho nó.
3. **Gắn dữ liệu từng biểu đồ** (`bind`) theo `references/template-guide.md`:
   - chọn measure/cột phù hợp **vai trò** của biểu đồ (thẻ KPI ← measure chính; xu hướng ← Calendar × measure; so sánh/tỷ trọng ← dimension × measure…);
   - ưu tiên các measure/dimension liên quan **mục tiêu G / câu hỏi Q** ở chặng 1 và ghép trong "Phụ lục (h)" ở chặng 2;
   - đặt **tiêu đề nêu thông điệp** cho biểu đồ; thẻ KPI có thể kèm `reference` là measure Delta % (vd. so với tháng trước).
4. **Biểu đồ không gắn được** → liệt kê trong `drop` (hoặc để trống): bản đồ khi không có dữ liệu địa lý, biểu đồ cần trường không tồn tại…
5. **Thay chữ** (`texts`): mọi textbox mang nội dung riêng của template (tên ngành, khẩu hiệu, tiêu đề phần) phải được thay bằng nội dung phù hợp dự án này hoặc bỏ. Textbox không nhắc tới sẽ **giữ nguyên chữ cũ của template**.
6. **Kiểm tra bộ biểu đồ chuẩn** (`references/chart-standards.md`): trong khả năng của template, dashboard cần có Chỉ số tổng quan, Xu hướng, So sánh, Tỷ trọng; Phân phối và Phân tầng khi phân tích chuyên sâu theo 1 dimension. Nhóm nào template không có chỗ → ghi rõ trong result.md.
7. **IBCS**: chọn dữ liệu sao cho hợp chuẩn (donut/pie ≤ 4 phần: chọn dimension ít giá trị — xem cột `distinct` trong tóm tắt dữ liệu; thời gian trái→phải; chi phí/rủi ro đảo màu độ lệch…). Định dạng hình thức do template quyết định; ghi chỗ lệch IBCS vào "Việc cần chỉnh thủ công".
8. **Xuất `dashboard-spec.json`** đúng `references/dashboard-spec-schema.md` (chế độ template).

## Quy tắc
- **KPI tổng quan: mỗi trang chỉ 4–6 thẻ (tối đa 6, không hơn).** Thẻ KPI = `card` / `cardVisual` / `kpi`. Nhiều hơn 6 thì cấu trúc trình bày bị vỡ. Chọn 4–6 chỉ số quan trọng nhất theo mục tiêu G; thẻ KPI dư của template → `drop`. Template chỉ có dưới 4 thẻ thì gắn hết. Script tự cắt phần vượt 6 (theo thứ tự đọc) và cảnh báo.
- Dùng **đúng `key`** trong bảng template (vd. `2.56ba69`), **đúng tên** measure (từng ký tự, theo `measures.json`) và `{table, column}` (theo `model-spec.json`; bảng `Calendar` có `Date, Year, Quarter, Month, MonthNo, YearQuarter, YearMonth, Day`).
- Vai trò dữ liệu (`roles`) phải là vai trò **có trong biểu đồ của template** (cột "vai trò dữ liệu"). Vai trò giá trị (Y, Y2, Data, Values của thẻ/bảng…) cần **measure**; vai trò chiều (Category, Group, Rows, Series, Values của slicer…) cần **cột**.
- Không bịa measure/cột. Gắn thiếu còn hơn gắn sai: biểu đồ không gắn sẽ bị bỏ cùng khung nền phía sau.
- Không tự viết file PBIP; **không** xuất khối FILE nào ngoài `dashboard-spec.json`.
- Không có template được chọn (chế độ cũ) → dùng cấu trúc `pages[].visuals[]` trong `references/dashboard-spec-schema.md` mục "Không template".

## Script tự làm (bạn không cần lo)
Giữ nguyên nền/hình/logo/shape/nút chuyển trang/theme; đổi `selector` định dạng theo trường mới; đưa đơn vị hiển thị số về tự động; bỏ định dạng gắn với trường cũ; bỏ bookmark, drillthrough, bộ lọc và tham chiếu tới trường của template; bỏ khung nền/biểu tượng phía sau biểu đồ đã bỏ; áp 5 màu người dùng nếu được chọn; dựng Semantic Model (bảng, quan hệ, measure, Calendar); tự kiểm tra cấu trúc + schema Microsoft.

## Output
1. **`result.md`** theo `assets/result-template.md`: template đã chọn, trang giữ/bỏ (lý do), **bảng gắn dữ liệu** (key → measure/cột → thông điệp), textbox đã thay, đối chiếu bộ biểu đồ chuẩn, checklist IBCS, việc chỉnh thủ công. Phần "Kết quả dựng PBIP" do script tự nối.
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
  <Tên>.Report/            (PBIR theo template: definition/, StaticResources/ ...)
  <Tên>.SemanticModel/     (TMDL: model, expressions, relationships, tables/*.tmdl, Calendar)
  data/*.csv · README.md
pbip-validation.md
```
Mở bằng Power BI Desktop: **File → Open → `<Tên>.pbip`**; nếu cần, đặt lại tham số `DataFolder` (README trong project).

## Tự kiểm tra
- [ ] **Mỗi trang có 4–6 thẻ KPI tổng quan (không quá 6)**
- [ ] Mỗi `key` trong `bind`/`texts`/`drop` có trong bảng template
- [ ] Mỗi `roles` dùng đúng vai trò của biểu đồ; measure ↔ cột đúng loại
- [ ] Không còn textbox mang nội dung riêng của template chưa được thay/bỏ
- [ ] Đã giải thích trang bị bỏ và biểu đồ không gắn được
- [ ] Đã đối chiếu bộ biểu đồ chuẩn và nêu nhóm template không có chỗ
