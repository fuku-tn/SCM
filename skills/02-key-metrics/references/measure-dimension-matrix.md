# Ghép Measure – Dimension (4 quan hệ)

Mục đích: quyết định mỗi nhóm câu hỏi sẽ được trả lời bằng ghép nào, để chặng Dashboard chọn biểu đồ.

| Pattern | Số Dimension | Số Measure | Ý nghĩa | Biểu đồ phù hợp (IBCS) |
|---|---|---|---|---|
| **1-1** | 1 | 1 | Một chỉ số theo một chiều | Cột (theo thời gian), Thanh ngang giảm dần (danh mục), Donut ≤ 4 phần |
| **N-1** | nhiều | 1 | Một chỉ số theo nhiều chiều (xếp tầng/ma trận) | Cột/Thanh xếp chồng ≤ 4 phân đoạn, Treemap, Bảng/ma trận |
| **1-N** | 1 | nhiều | Nhiều chỉ số theo một chiều | Bảng, Combo cột + đường, nhiều biểu đồ nhỏ cùng thang đo |
| **N-N** | nhiều | nhiều | Nhiều chỉ số × nhiều chiều | Bảng/ma trận chi tiết, Scatter (2 measure số) |

## Nhóm biểu đồ chuẩn của Dashboard
| Nhóm (`section`) | Trả lời | Thường là ghép |
|---|---|---|
| `overview` — Chỉ số tổng quan | Tình hình chung ngay lúc này | KPI (card) — 1-1 với tổng; kèm Delta |
| `trend` — Xu hướng | Biến động theo thời gian | 1-1 với dimension thời gian |
| `comparison` — So sánh | Nhóm nào hơn nhóm nào | 1-1 / 1-N với dimension phi thời gian |
| `composition` — Tỷ trọng | Cơ cấu đóng góp | 1-1 hoặc N-1 (tối đa 4 phần, gộp "Khác") |
| `distribution` — Phân phối | Giá trị phân bố thế nào (cần khi phân tích chuyên sâu theo 1 dimension) | 1-1 với Numerical theo nhóm/khoảng |
| `breakdown` — Phân tầng | Tách một số theo nhiều tầng (cần khi phân tích chuyên sâu theo 1 dimension) | N-1 (tầng cha → con), Waterfall |

## Quy tắc ghép
1. Mỗi dimension người dùng chọn phải xuất hiện ít nhất một lần trong `combos`.
2. Mỗi measure chính (SUM/Performance) xuất hiện ít nhất một lần.
3. Dimension thời gian (`isDate`) dùng cho `trend`; dimension phi thời gian dùng cho `comparison/composition/breakdown`.
4. Cùng đơn vị → cùng thang đo khi đặt cạnh nhau.
5. Đếm đúng: 1 dim + 1 measure = `1-1`; nhiều dim + 1 measure = `N-1`; 1 dim + nhiều measure = `1-N`; nhiều + nhiều = `N-N`.

## Phụ lục (h) — bảng bàn giao cho Dashboard
Trong `result.md` có một bảng tổng hợp gồm: `Nhóm | Pattern | Dimension | Measure | Mục đích | Biểu đồ gợi ý`. Chặng Dashboard dùng bảng này làm đầu vào bố cục.
