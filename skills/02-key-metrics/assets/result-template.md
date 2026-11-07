# Key Metrics — {Tên dự án}

## 1. Bản đồ chỉ số (Key Metric người dùng chọn → cột dữ liệu)
| Key Metric (người dùng chọn) | Bảng | Cột | Phục vụ mục tiêu | Ghi chú |
|---|---|---|---|---|
| Doanh thu | Ban hang | Doanh thu | G1 | |
| Lợi nhuận | — | — | G1 | Phái sinh = Doanh thu − Chi phí |

## 2. Phân lập Numerical / Categorical
| Bảng.Cột | Loại | Bằng chứng (type, distinct, tên cột) |
|---|---|---|
| Ban hang.Doanh thu | Numerical | number, min…max… |
| Ban hang.Mã SP | Categorical | mã sản phẩm, distinct = … |

## 3. Phép tính cơ bản đã chọn
| Metric | Phép tính | Vì sao chọn |
|---|---|---|
| Doanh thu | SUM, AVG | SUM = tổng quy mô; AVG = giá trị trung bình mỗi giao dịch |

> Không bắt buộc tính hết các phép: chỉ liệt kê phép phục vụ yêu cầu.

## 4. Performance
| Performance | Tử số (SUM) | Mẫu số (COUNT / DISTINCTCOUNT) | Ý nghĩa kinh doanh |
|---|---|---|---|

## 5. So sánh theo thời gian
- Kỳ người dùng chọn: {YoY/MoM/QoQ/DoD} → {LY/LM/LQ/LD}
- Áp dụng cho: …

## 6. Delta và % Delta
- Mỗi measure ở mục 5 có `Delta` và `Delta %` tương ứng. Quy ước màu: thuận lợi = xanh, bất lợi = đỏ (đảo ngược với chỉ số Chi phí/Rủi ro).

## 7. Ghép Measure – Dimension
| # | Pattern | Dimension | Measure | Mục đích | Nhóm |
|---|---|---|---|---|---|
| 1 | 1-1 | Khu vực | Doanh thu (SUM) | So sánh khu vực | comparison |
| 2 | 1-N | Tháng | Doanh thu (SUM), Số lượng (SUM) | Xu hướng | trend |
| 3 | N-1 | Khu vực, Nhóm SP | Doanh thu (SUM) | Phân tầng | breakdown |
| 4 | N-N | … | … | Chi tiết | detail |

## 8. Phụ lục (h) — bàn giao cho Dashboard
| Nhóm | Pattern | Dimension | Measure | Mục đích | Biểu đồ gợi ý |
|---|---|---|---|---|---|
| overview | 1-1 | (tổng) | Doanh thu (SUM) + Delta | KPI tổng quan | card |
| trend | 1-N | Tháng | … | Xu hướng | lineChart |

## 8b. Kiểm chứng giả thuyết (H# từ chặng 1) bằng chỉ số × chiều
| Giả thuyết (H#) | Phát hiện nền (F#) | Chỉ số (measure) | Chiều | Cách đọc kết quả | Ghép # (mục 7) |
|---|---|---|---|---|---|
| H1 | F12 | Doanh thu (SUM) | Khu vực | Nếu khu vực X giảm nhiều hơn các khu vực khác → giả thuyết đứng vững | 1 |

> Mỗi H# ở chặng 1 phải có ít nhất một dòng ở đây (hoặc ghi lý do không kiểm chứng được). Mỗi KPI/measure nêu trong "Bản đồ chỉ số" cần gắn G# và, nếu có, F#.

## 9. Giả định và những việc không thực hiện được
- …

<!-- Công thức DAX sẽ được script tự nối vào cuối file này -->
