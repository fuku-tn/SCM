# Mẫu công thức DAX (do scripts/post.js sinh — bạn KHÔNG viết tay)

Tên bảng đặt trong `'…'`. `'T'` = bảng, `[C]` = cột, `[M]` = measure.

## 1. Phép tính cơ bản
| Loại | Phép | DAX |
|---|---|---|
| Numerical | SUM | `SUM('T'[C])` |
| Numerical | AVG | `AVERAGE('T'[C])` |
| Numerical | MAX | `MAX('T'[C])` |
| Numerical | MIN | `MIN('T'[C])` |
| Numerical | MEDIAN | `MEDIAN('T'[C])` |
| Numerical | RANGE | `MAX('T'[C]) - MIN('T'[C])` |
| Categorical | COUNT | `COUNT('T'[C])` (đếm ô không trống) |
| Categorical | DISTINCTCOUNT | `DISTINCTCOUNT('T'[C])` |

Tên measure: `{Nhãn} ({PHÉP})`, ví dụ `Doanh thu (SUM)`.

## 2. Performance
```
{Nhãn} = DIVIDE([Tử số SUM], [Mẫu số COUNT hoặc DISTINCTCOUNT])
```
Ví dụ: `Doanh thu / khách = DIVIDE([Doanh thu (SUM)], [Khách hàng (DISTINCTCOUNT)])`.
Tử số nên là SUM; mẫu số nên là COUNT hoặc DISTINCTCOUNT. Dùng `DIVIDE` để tránh lỗi chia 0.

## 3. Phái sinh (derived)
Biểu thức giữa các measure đã có, viết bằng `{id.PHÉP}`: `"{rev.SUM} - {cost.SUM}"` → `[Doanh thu (SUM)] - [Chi phí (SUM)]`.

## 4. So sánh theo thời gian (cần bảng ngày `'Calendar'[Date]`)
Bảng `Calendar` do chặng Dashboard tự tạo và nối với cột ngày của bảng fact.

| Kỳ người dùng chọn | Nhãn | DAX |
|---|---|---|
| YoY (Year over Year) | LY — cùng kỳ năm trước | `CALCULATE([M], SAMEPERIODLASTYEAR('Calendar'[Date]))` |
| QoQ (Quarter over Quarter) | LQ — quý trước | `CALCULATE([M], DATEADD('Calendar'[Date], -1, QUARTER))` |
| MoM (Month over Month) | LM — tháng trước | `CALCULATE([M], DATEADD('Calendar'[Date], -1, MONTH))` |
| DoD (Day over Day) | LD — ngày trước | `CALCULATE([M], DATEADD('Calendar'[Date], -1, DAY))` |

Tên: `{Measure} LY`, `{Measure} LQ`, `{Measure} LM`, `{Measure} LD`.

## 5. Delta và % Delta
```
{M} Delta {TAG}   = [M] - [M {TAG}]
{M} Delta % {TAG} = DIVIDE([M] - [M {TAG}], [M {TAG}])      -- định dạng 0.0%;-0.0%;0.0%
```
Quy ước màu (IBCS): Delta thuận lợi = xanh `#38A169`, bất lợi = đỏ `#E53E3E` (đảo ngược với chỉ số Chi phí/Rủi ro).

## 6. Định dạng
- Số lượng / tiền: `#,##0` · Số thập phân: `#,##0.00` · Tỷ lệ: `0.0%`
- Khai báo `format` trong `metrics-spec.json` nếu cần khác mặc định.
