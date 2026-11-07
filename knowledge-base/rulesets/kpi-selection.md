# Ruleset: Chọn KPI theo người xem và mục tiêu

Nguồn nạp: SKILL khai báo `knowledge: kpi-selection` → server nạp file này vào prompt.

## Nguyên tắc chọn KPI
1. **Mỗi KPI trả lời một quyết định.** Nếu không biết "KPI này đổi thì ai làm gì", bỏ nó.
2. **Mỗi mục tiêu kinh doanh (Business Goal) có ≥ 1 KPI đo trực tiếp** + 1 KPI dẫn dắt (leading) nếu có dữ liệu.
3. **Cân bằng 3 nhóm**: kết quả (Doanh thu, Lợi nhuận), hiệu quả (Biên, Doanh thu/đơn, Chi phí/đơn vị), tăng trưởng (so kỳ trước/cùng kỳ).
4. **Mỗi KPI luôn kèm so sánh**: kỳ trước (MoM/QoQ), cùng kỳ (YoY) hoặc mục tiêu; số tuyệt đối đứng một mình không có ý nghĩa.
5. **Không trùng lặp**: không đưa 2 KPI cùng bản chất (Doanh thu và Doanh thu trước thuế) trừ khi người xem cần cả hai.
6. **Chỉ dùng cột có thật** trong dữ liệu; thiếu cột → ghi `[Giả định]` hoặc loại KPI, không bịa.

## Số lượng theo người xem (luật cứng dự án: 4–6 thẻ KPI/trang)
| Nhóm người xem | KPI / trang | Ưu tiên |
|---|---|---|
| Chiến lược (C-level, Director) | 4 | Kết quả + tăng trưởng + biên; ngoại lệ nổi bật |
| Quản lý (Manager, Lead) | 4–5 | Kết quả theo đội/khu vực + hiệu quả vận hành |
| Phân tích (Senior, Middle) | 5–6 | Thêm chỉ số chất lượng, phân phối |
| Vận hành (Junior, Fresher) | 4–5 | Chỉ số gắn việc hằng ngày, ngôn ngữ đơn giản |

## Phân loại độ đo (để sinh DAX đúng)
- **Numerical** (số tiền, số lượng): SUM, AVERAGE, MIN, MAX, MEDIAN.
- **Categorical** (mã, tên): COUNT, DISTINCTCOUNT.
- **Derived**: hiệu/tổng của các độ đo (Lợi nhuận = Doanh thu − Chi phí).
- **Performance / Ratio**: tử số / mẫu số (luôn dùng DIVIDE để tránh chia 0) — Biên, Doanh thu/đơn, Tỷ lệ.
- **Time intelligence**: LY/LQ/LM/LD, chênh lệch tuyệt đối và %, chỉ áp cho độ đo cộng dồn được.

## Quan hệ độ đo – chiều (1-1, N-1, 1-N, N-N)
- Độ đo nằm ở bảng fact (phía N); chiều ở bảng dimension (phía 1) → N-1, lọc một chiều từ dimension sang fact.
- N-N chỉ chấp nhận khi có bảng cầu nối; ghi rõ rủi ro đếm trùng.

## Lỗi thường gặp
- Cộng dồn tỷ lệ (cộng Biên của các tháng) → phải tính lại từ tử/mẫu.
- KPI "đẹp" nhưng dữ liệu không đủ kỳ so sánh → đánh dấu `[Giả định]`/loại bỏ phần so sánh.
- Trộn đơn vị (VND và triệu VND) trên cùng thẻ.
