# Hướng dẫn gắn dữ liệu vào template Power BI

Template là file `.pbix` (định dạng PBIR) trong `templates/`. Người dùng chọn 1 template ở bước Dashboard của trang Analysis. Script `lib/pbix-template.js` đọc template và đưa cho bạn bảng các biểu đồ (mục "TEMPLATE POWER BI ĐÃ CHỌN" trong prompt).

## 1. Điều gì được giữ, điều gì thay đổi
| Giữ nguyên (do script) | Bạn quyết định | Bị bỏ (do script) |
|---|---|---|
| Kích thước trang, nền (hình), shape, hình/logo/icon, nút chuyển trang, theme màu, nhóm (group), vị trí/kích thước mọi thứ, **định dạng** từng biểu đồ (cỡ chữ, màu theo theme, nhãn, trục…) | Trang nào giữ; **dữ liệu** của từng biểu đồ; chữ trong textbox; biểu đồ nào bỏ | Bookmark, drillthrough (`pageBinding`), bộ lọc (`filterConfig`), tooltip trỏ trang đã bỏ, tham chiếu trường của template, định dạng gắn với trường cũ (vd. màu theo luật của measure cũ) |

## 2. Cách đọc bảng biểu đồ dữ liệu
| Cột | Ý nghĩa |
|---|---|
| `key` | `<số trang>.<mã 6 ký tự>` — dùng trong `bind`, `drop`, `texts` |
| loại | `cardVisual`, `card`, `lineChart`, `donutChart`, `treemap`, `pivotTable`, `slicer`, `textSlicer`, `advancedSlicerVisual`, `clusteredBarChart`, `lineClusteredColumnComboChart`, `map`, `shapeMap`… |
| vị trí x,y (rộng×cao) | Vùng biểu đồ trên trang → suy ra vai trò (KPI ở trên cùng, xu hướng rộng ở giữa…) |
| vai trò dữ liệu | Tên vai trò + số trường template dùng + loại (`measure` hay `cột`) |
| template đang dùng | Trường cũ — chỉ để hiểu **ý nghĩa** biểu đồ, không dùng lại |

## 3. Vai trò → loại trường
| Vai trò | Trường | Ví dụ |
|---|---|---|
| `Data` (cardVisual), `Values` (card, pivot, treemap), `Y`, `Y2`, `Size`, `Tooltips` | **Measure** (tên chuỗi) | `"Doanh thu (SUM)"` |
| `Category`, `Group`, `Rows`, `Columns`, `Series`, `Details`, `Legend` | **Cột** `{table, column}` | `{"table":"Calendar","column":"YearMonth"}` |
| `Values` của `slicer`, `textSlicer`, `advancedSlicerVisual` | **Cột** | `{"table":"Calendar","column":"Year"}` |

## 4. Chọn trường theo loại biểu đồ
| Loại | Gợi ý gắn |
|---|---|
| Thẻ KPI (`cardVisual`, `card`) | 1 measure quan trọng; `reference` = measure Delta % (vd. `"Doanh thu (SUM) Delta % LM"`), `referenceTitle` = "so với tháng trước" |
| Đường / cột theo thời gian | Category = `Calendar.YearMonth` (hoặc `YearQuarter`, `Year`); Y = measure chính; Y2 = measure phụ (khác đơn vị) |
| Thanh / cột so sánh | Category = dimension phi thời gian; Y = measure; template sắp giảm dần tự động |
| Donut / Pie | Category = dimension **ít giá trị (≤ 4)**; Y = 1 measure cộng dồn được |
| Treemap | Group = dimension nhiều giá trị; Values = 1 measure |
| Bảng / pivot | Rows = dimension; Values = 3–5 measure liên quan |
| Slicer | Cột dimension (hoặc `Calendar.Year`/`Month`); mỗi slicer một cột khác nhau |
| Bản đồ (`map`, `shapeMap`) | Chỉ khi có cột địa lý thật; nếu không → `drop` |
| Combo (`lineClusteredColumnComboChart`) | Category; Y = measure dạng cột; Y2 = measure dạng đường |

## 4b. Quy tắc thẻ KPI: 4–6 thẻ mỗi trang
Mỗi trang chỉ gắn **4–6 thẻ KPI** (`card`, `cardVisual`, `kpi`), không quá 6. Template có nhiều hơn 6 thẻ KPI (vd. trang Geography của HR có 10 thẻ gồm cả thẻ mũi tên và thẻ YoY%) thì chọn 4–6 chỉ số quan trọng nhất cho các thẻ chính và đưa phần còn lại vào `drop`; dùng `reference` để hiện Delta ngay trong thẻ chính. Script tự cắt phần vượt 6 theo thứ tự đọc (trên→dưới, trái→phải) kèm cảnh báo.

## 5. Tiêu đề và chữ
- `title`: câu nêu **thông điệp** ("Doanh thu miền Bắc dẫn đầu"), không chỉ tên measure. `title: ""` để ẩn tiêu đề.
- `subtitle`: đơn vị (VND, %, đơn).
- `texts`: textbox có nội dung riêng của template (tên lĩnh vực, khẩu hiệu, tiêu đề mục…) → thay bằng nội dung phù hợp. Có thể dùng `\n` để xuống dòng. Giữ ngắn gọn bằng độ dài chữ cũ để không tràn khung.

## 6. Khi dữ liệu không đủ
- Ít dimension hơn số biểu đồ: gắn lặp lại hợp lý hoặc `drop` biểu đồ dư (đừng gắn bừa).
- Template có nhiều trang chuyên đề (vd. Department, Geography) nhưng dữ liệu không có chiều tương ứng → bỏ trang đó khỏi `pages.keep`. Nút chuyển trang tới trang đã bỏ sẽ tự bị bỏ.
- Trang `Tooltip` (ẩn): bỏ trừ khi bạn gắn dữ liệu cho nó.

## 7. Màu
- Mặc định **giữ màu của template** (theme + màu cố định trong định dạng).
- Nếu người dùng chọn "5 màu của tôi", script thay 5 màu đầu của `dataColors` trong theme; màu cố định ghi cứng trong định dạng từng biểu đồ vẫn giữ nguyên — nêu điều này trong "Việc chỉnh thủ công".

## 8. Giới hạn đã biết
- Không xem trước được giao diện kết quả ngoài Power BI Desktop; script chỉ đảm bảo cấu trúc hợp lệ.
- Nút/hiệu ứng dùng bookmark của template (chuyển đổi hiển thị ma trận, v.v.) không còn hoạt động.
- Số liệu mẫu của template (hình nền chụp sẵn) có thể còn trong ảnh nền — hình nền là tài sản của template.
