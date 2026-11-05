# Dashboard (PBIP) — {Tên dự án}

## 1. Template đã chọn
- Template: **{tên}** (người dùng chọn) · Chế độ màu: giữ màu template / dùng 5 màu của người dùng
- Điều làm nên "giao diện" của template (nền, hình, nút chuyển trang…): …
- Điều được giữ nguyên / bị bỏ do script: bookmark, drillthrough, bộ lọc riêng của template

## 2. Người xem và định hướng
- Người xem: {phòng ban · vị trí · level} → mức chi tiết: …
- Thông điệp chính của dashboard: …

## 3. Trang giữ lại và trang bỏ
| Trang | Giữ? | Lý do |
|---|---|---|
| Home | ✅ | Giới thiệu, nút chuyển trang |
| Overview | ✅ | … |
| Geography | ❌ | Dữ liệu không có chiều địa lý |

## 4. Bảng gắn dữ liệu
### Trang "Overview"
| key | Loại biểu đồ | Vai trò → trường | Tiêu đề (thông điệp) | Nhóm chuẩn |
|---|---|---|---|---|
| 2.56ba69 | cardVisual | Data ← Doanh thu (SUM); ref ← Doanh thu (SUM) Delta % LM | Doanh thu | Chỉ số tổng quan |
| 2.e9ae97 | lineChart | Category ← Calendar.YearMonth; Y ← …; Y2 ← … | … | Xu hướng |

### Biểu đồ bỏ (không gắn được)
| key | Loại | Lý do |
|---|---|---|
| 2.f9a724 | shapeMap | Không có dữ liệu địa lý |

### Textbox đã thay
| key | Chữ cũ | Chữ mới |
|---|---|---|

## 5. Đối chiếu bộ biểu đồ chuẩn
| Nhóm | Có? | Biểu đồ (key) |
|---|---|---|
| Chỉ số tổng quan | ✅ | … |
| Xu hướng | ✅ | … |
| So sánh | ✅ | … |
| Tỷ trọng | ✅ | … |
| Phân phối | ✅ / template không có chỗ / không cần | … |
| Phân tầng | ✅ / template không có chỗ / không cần | … |

## 6. Checklist IBCS (trong phạm vi template cho phép)
- [ ] Thời gian trái → phải; danh mục sắp giảm dần
- [ ] Donut/pie ≤ 4 phần; đường ≤ 3
- [ ] Màu xanh/đỏ chỉ cho Delta thuận lợi/bất lợi
- [ ] Cùng đơn vị → cùng thang đo

## 7. Việc cần chỉnh thủ công trong Power BI Desktop
- (chỗ template lệch IBCS, màu cố định, nút bookmark không còn hoạt động…)

<!-- Phần "Kết quả dựng PBIP" sẽ được script tự nối vào cuối file này -->
