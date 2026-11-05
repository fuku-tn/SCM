# Bộ biểu đồ chuẩn của Dashboard

Quy tắc định dạng chi tiết từng loại biểu đồ: xem `ibcs-standard.md`. File này quy định **dashboard phải có biểu đồ nào** và ánh xạ sang loại visual Power BI mà script hỗ trợ.

## 1. Sáu nhóm biểu đồ chuẩn
| # | Nhóm | Bắt buộc? | Trả lời | Visual Power BI (`type`) | Quy tắc IBCS chính |
|---|---|---|---|---|---|
| 1 | **Chỉ số tổng quan** | Luôn | Tình hình chung | `card` (kèm measure Delta / Delta %) | Số lớn, đơn vị ở phụ đề; Delta thuận lợi xanh, bất lợi đỏ |
| 2 | **Xu hướng** | Luôn | Biến động theo thời gian | `clusteredColumnChart` (ít kỳ), `lineChart` (≥ 12–24 kỳ), `lineClusteredColumnComboChart` | Thời gian trái→phải; tắt trục Y, nhãn trực tiếp; đường thẳng, không marker |
| 3 | **So sánh** | Luôn | Nhóm nào hơn nhóm nào | `clusteredBarChart` (danh mục), `clusteredColumnChart` (thứ tự tự nhiên) | Sắp **giảm dần**; tên danh mục bên trái, giá trị bên phải đầu thanh |
| 4 | **Tỷ trọng** | Luôn | Cơ cấu đóng góp | `donutChart`/`pieChart` (≤ 4 phần), `hundredPercentStackedBarChart`/`…ColumnChart`, `treemap` (nhiều danh mục) | ≤ 4 phần + "Khác"; % ghi trực tiếp; bỏ chú giải |
| 5 | **Phân phối** | Khi phân tích chuyên sâu 1 dimension | Giá trị phân bố thế nào giữa các thành viên | `scatterChart` (mỗi điểm = 1 thành viên; 2 measure số), `clusteredBarChart` đã sắp xếp | Giữ 2 trục mảnh có tiêu đề; chỉ gắn nhãn điểm nổi bật |
| 6 | **Phân tầng** | Khi phân tích chuyên sâu 1 dimension | Tách một số theo từng tầng / thành phần | `waterfallChart`, `stackedBarChart`/`stackedColumnChart` (≤ 4 phân đoạn), `treemap`, `tableEx` | Phân đoạn lớn nhất ở gốc; tổng ở đỉnh; thứ tự nhất quán |

Ngoài ra: `slicer` (lọc), `tableEx` (bảng chi tiết, căn trái chữ / phải số), `areaChart`, `funnel`, `pieChart`.

### Quy tắc số lượng thẻ KPI (bắt buộc)
Nhóm **Chỉ số tổng quan** chỉ có **4–6 thẻ KPI mỗi trang** (tối đa 6). Nhiều hơn làm cấu trúc trình bày bị vỡ. Ưu tiên chỉ số gắn trực tiếp với mục tiêu G ở chặng 1; kèm Delta / Delta % trong nhãn tham chiếu thay vì thêm thẻ riêng cho Delta.

## 2. Khi nào là "phân tích chuyên sâu theo 1 dimension"
- Người dùng chỉ chọn **một** Dimension; hoặc
- Yêu cầu phân tích ghi rõ: "chuyên sâu", "deep dive", "chi tiết theo {dimension}", "đi sâu vào {dimension}".

→ Thêm **trang riêng** (vd. "Chuyên sâu — Khu vực") gồm: ít nhất 1 biểu đồ **Phân phối** và 1 biểu đồ **Phân tầng** cho dimension đó.

## 3. Cấu trúc trang gợi ý
| Trang | Nội dung | Hàng lưới |
|---|---|---|
| Tổng quan | Hàng 0–1: 3–4 thẻ KPI + slicer; hàng 2–6: xu hướng (trái, rộng 7) + so sánh (phải, rộng 5); hàng 7–11: tỷ trọng + bảng chi tiết | 12 × 12 |
| Chuyên sâu — {dimension} (nếu cần) | Phân phối + Phân tầng + bảng | 12 × 12 |

## 4. Phối hợp với ghép Measure–Dimension của chặng 2
Dùng bảng "Phụ lục (h)": mỗi dòng đã có nhóm + loại biểu đồ gợi ý. Giữ nguyên nếu hợp lý; đổi nếu vi phạm IBCS và nêu lý do.

## 5. Những điều IBCS cần nhưng chưa tự động được (ghi vào "Việc chỉnh thủ công")
- Họa tiết gạch chéo cho kỳ dự báo (FC) / viền rỗng cho kế hoạch (PL)
- Gắn tên series trực tiếp ở đầu mút thay chú giải
- Thanh độ lệch (variance bar / pinhead) trong bảng
- Đường tham chiếu (trung vị / mục tiêu) trên scatter
- Dòng Tổng kẻ đôi trong bảng
