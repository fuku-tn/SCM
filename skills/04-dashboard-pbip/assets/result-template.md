# Dashboard (PBIP) — {Tên dự án}

## 1. Phân tích template mẫu
- Template đã xem: {tên file} (người dùng tải lên / templates/)
- Điều lấy cảm hứng: số trang, bố cục KPI, kiểu biểu đồ, cách chia vùng …
- Điều không áp dụng và lý do: …

## 2. Người xem và định hướng thiết kế
- Người xem: {phòng ban · vị trí · level} → mức chi tiết: …
- Theme màu (5 mã): #… #… #… #… #…
- Thông điệp chính của dashboard: …

## 3. Bố cục
### Trang 1 — Tổng quan
| Vị trí lưới (col,row,w×h) | Biểu đồ (type) | Tiêu đề (thông điệp) | Measure / Dimension | Nhóm chuẩn |
|---|---|---|---|---|
| 0,0, 3×2 | card | … | Doanh thu (SUM) | Chỉ số tổng quan |
| 0,2, 7×5 | lineChart | … | Doanh thu (SUM) × Calendar.YearMonth | Xu hướng |
| 7,2, 5×5 | clusteredBarChart | … | … | So sánh |
| 0,7, 4×5 | donutChart | … | … | Tỷ trọng |

### Trang 2 — Chuyên sâu theo {dimension} (nếu có)
| … | scatterChart | … | … | Phân phối |
| … | waterfallChart | … | … | Phân tầng |

## 4. Đối chiếu bộ biểu đồ chuẩn
| Nhóm | Có? | Biểu đồ |
|---|---|---|
| Chỉ số tổng quan | ✅ | … |
| Xu hướng | ✅ | … |
| So sánh | ✅ | … |
| Tỷ trọng | ✅ | … |
| Phân phối | ✅ / không cần | … |
| Phân tầng | ✅ / không cần | … |

## 5. Checklist IBCS
- [ ] Thời gian trái → phải, danh mục sắp giảm dần
- [ ] Không lưới / 3D / bóng / gradient / viền
- [ ] Nhãn trực tiếp, trục giá trị ẩn ở cột/thanh
- [ ] Tối đa 4 phân đoạn (xếp chồng, donut); tối đa 3 đường
- [ ] Màu xanh/đỏ chỉ dùng cho Delta thuận lợi/bất lợi
- [ ] Cùng đơn vị → cùng thang đo

## 6. Việc cần chỉnh thủ công trong Power BI Desktop
- (những điều IBCS cần nhưng script chưa tự áp dụng được)

<!-- Phần "Kết quả dựng PBIP" sẽ được script tự nối vào cuối file này -->
