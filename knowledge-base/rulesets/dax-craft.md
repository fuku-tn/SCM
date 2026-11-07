# Ruleset: Thủ pháp viết DAX

Lưu ý: công thức DAX do **script** sinh từ `metrics-spec.json`. Model chỉ mô tả độ đo trong spec; ruleset này giúp model **mô tả đúng** để script sinh DAX tốt.

## Quy ước
1. **Measure, không dùng calculated column** cho mọi phép tổng hợp (SUM/AVERAGE/DISTINCTCOUNT...).
2. **Chia luôn dùng `DIVIDE(tử, mẫu)`**, không dùng toán tử `/` (tránh lỗi chia 0).
3. **Tham chiếu đầy đủ**: cột `'Bảng'[Cột]`, measure `[Tên measure]` (không kèm tên bảng).
4. **Đặt tên measure có nghĩa nghiệp vụ**, tiếng Việt như dữ liệu: `Doanh thu`, `Lợi nhuận`, `Doanh thu LY`, `Doanh thu YoY %`. Giữ đúng từng ký tự giữa các chặng.
5. **Measure dẫn xuất tái dùng measure cơ bản** (`[Lợi nhuận] = [Doanh thu] - [Chi phí]`), không viết lại SUM.
6. **Định dạng**: tiền `#,0`, tỷ lệ `0.0%`, số đếm `#,0`; đơn vị ghi trong `unit` của spec.

## Time intelligence
- Cần **bảng Calendar liên tục** (script tạo) đánh dấu là date table; quan hệ Calendar[Date] → cột ngày của fact.
- LY: `CALCULATE([X], SAMEPERIODLASTYEAR(Calendar[Date]))`; LM: `DATEADD(Calendar[Date], -1, MONTH)`; LQ: `DATEADD(..., -1, QUARTER)`; LD: `DATEADD(..., -1, DAY)`.
- Chênh lệch: `[X] - [X LY]`; phần trăm: `DIVIDE([X] - [X LY], [X LY])`.
- Chỉ áp time intelligence cho độ đo **cộng dồn được** (SUM/COUNT). Không áp cho tỷ lệ trừ khi tính lại từ tử/mẫu.
- Không có cột ngày → **không** sinh measure thời gian; ghi rõ trong result.md.

## Hiệu năng
- Tránh `FILTER(ALL(bảng_lớn), …)`; dùng điều kiện cột trực tiếp trong `CALCULATE`.
- Tránh iterator (SUMX) khi SUM đủ dùng.
- Không đặt measure phức tạp trong thẻ KPI nếu có thể tái dùng measure cơ bản.

## Kiểm tra trước khi bàn giao
- Mọi cột/measure được tham chiếu đều tồn tại (script `validate_build.js` kiểm tra).
- Không có measure nào không được dùng và cũng không có ý nghĩa bàn giao.
