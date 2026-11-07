---
name: key-metrics
title: Key Metrics
description: Phân lập chỉ số Numerical/Categorical, tính SUM-MAX-MIN-AVG-MEDIAN-RANGE / COUNT-DISTINCTCOUNT, Performance, so sánh LY-LQ-LM-LD với Delta và %Delta, rồi ghép quan hệ Measure–Dimension (1-1, N-1, 1-N, N-N) để vẽ Dashboard.
handoff: measures.json
knowledge: kpi-selection, dax-craft
---

# SKILL: Key Metrics (Chặng 2)

## Mục đích
Từ Business Goal và các chỉ số / chiều / kỳ so sánh người dùng đã chọn, tạo ra **bộ measure DAX** và **bản đồ ghép Measure–Dimension** cho chặng Dashboard.
Kết quả: `result.md` + `metrics-spec.json` (bạn viết) → script `post.js` **sinh công thức DAX xác định** vào `measures.json`, `measures.dax` và nối vào `result.md`.

## Cấu trúc SKILL (bắt buộc)
| Thành phần | Nội dung |
|---|---|
| `SKILL.md` | Hướng dẫn này |
| `references/` | `dax-patterns.md`, `metrics-spec-schema.md`, `measure-dimension-matrix.md` |
| `assets/` | `result-template.md`, `metrics-spec.example.json` |
| `scripts/` | `post.js` — kiểm tra spec với dữ liệu thật, sinh DAX, nối kết quả vào result.md |

## Đầu vào
Output chặng 1 (Business Goal) · danh sách Key Metrics, kỳ so sánh (YoY/MoM/QoQ/DoD), Dimension người dùng chọn · profile dữ liệu của các bảng/sheet đã chọn (tên bảng = tên sheet).

## Quy trình
1. **Ánh xạ**: mỗi Key Metric người dùng chọn → bảng + cột thật trong profile. Metric không có cột tương ứng:
   - tính được từ các cột khác (Lợi nhuận = Doanh thu − Chi phí) → dùng `derived`;
   - không tính được → ghi vào "Cảnh báo / không thực hiện được", **không bịa cột**.
2. **Phân lập** từng cột: **Numerical** (cột số đo được, có thể cộng/trung bình) hay **Categorical** (mã, tên, nhóm, ngày dạng nhãn…). Dựa vào `type`, số `distinct`, tên cột; ghi bằng chứng. Cột số nhưng thực chất là mã (ID, SKU) → **Categorical**.
3. **Phép tính cơ bản**
   - Numerical: `SUM, MAX, MIN, AVG, MEDIAN, RANGE`
   - Categorical: `COUNT, DISTINCTCOUNT`
   - **Không bắt buộc tính hết.** Chỉ chọn phép tính phục vụ yêu cầu và người xem (vd. doanh thu: SUM là chính; AVG/MAX khi cần phân tích đơn hàng).
4. **Performance** = một giá trị `SUM` chia cho `COUNT` hoặc `DISTINCTCOUNT` (vd. Doanh thu / số khách hàng). Chỉ tạo khi có ý nghĩa kinh doanh.
5. **Theo thời gian** — chỉ theo kỳ người dùng đã chọn: `YoY→LY`, `QoQ→LQ`, `MoM→LM`, `DoD→LD`. Người dùng không chọn kỳ nào → **không** tạo measure thời gian. Chọn measure nền cần so sánh bằng `timeApplyTo` (thường SUM chính và Performance).
6. **Delta và % Delta** cho từng kỳ so sánh (script tự sinh cho mọi measure trong `timeApplyTo`).
7. **Ghép Measure–Dimension** theo 4 quan hệ `1-1`, `N-1`, `1-N`, `N-N` (xem `references/measure-dimension-matrix.md`). Mỗi ghép ghi: mục đích, nhóm biểu đồ (tổng quan / xu hướng / so sánh / tỷ trọng / phân phối / phân tầng) và loại biểu đồ gợi ý.
8. **Phụ lục (h) — dùng để vẽ Dashboard về sau**: tổng hợp các ghép ở bước 7 thành bảng đưa thẳng cho chặng Dashboard.
8b. **Kiểm chứng giả thuyết**: với mỗi `H#` của chặng 1 chọn chỉ số × chiều (đã có trong các ghép ở bước 7) để kiểm chứng; ghi vào mục "8b" của result.md cùng `F#` nền. Ưu tiên chỉ số có F# chứng minh có biến động đáng chú ý (ngoại lệ, xu hướng, tập trung) thay vì chỉ số "cho đủ". Không chọn hai chỉ số quan hệ định nghĩa (Doanh thu, Chi phí, Lợi nhuận) cho cùng một mục đích kiểm chứng.
9. **Xuất `metrics-spec.json`** đúng `references/metrics-spec-schema.md`.

## Quy tắc
- Tên bảng/cột trong spec **phải khớp profile** (script đối chiếu; sai → metric bị loại).
- `id` ngắn, không dấu (`rev`, `orders`); phép tính tham chiếu dạng `id.PHÉP` (`rev.SUM`, `orders.DISTINCTCOUNT`).
- Phép tính sai loại (SUM trên Categorical, AVG trên mã…) sẽ bị script loại và cảnh báo — tránh ngay từ đầu.
- Không tự viết DAX trong spec; chỉ khai báo cột + phép tính. Công thức do script sinh theo `references/dax-patterns.md`.
- Ghi số liệu / giả định rõ ràng; không suy diễn ngoài dữ liệu.

## Output
1. **`result.md`** theo `assets/result-template.md`. Phần "Công thức DAX" ở cuối sẽ do script tự nối — không cần chép DAX vào.
2. **Khối file** (đúng cú pháp, không bọc ```):
```
<<<FILE: metrics-spec.json>>>
{ ... JSON hợp lệ theo schema ... }
<<<END FILE>>>
```

## Tự kiểm tra
- [ ] Mỗi Key Metric người dùng chọn đều có trong `metrics` hoặc `derived` (hoặc giải thích vì sao không làm được)
- [ ] Mỗi cột đã phân lập Numerical/Categorical có bằng chứng
- [ ] Chỉ có measure thời gian cho các kỳ người dùng chọn
- [ ] Mỗi `combo` có đúng pattern (số dimension × số measure)
- [ ] `metrics-spec.json` là JSON hợp lệ, tên bảng/cột đúng profile
