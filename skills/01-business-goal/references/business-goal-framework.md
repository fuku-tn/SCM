# Khung tư duy: từ thông tin thô đến chuỗi logic Business Goal

## 1. Chuỗi logic bắt buộc
```
Bối cảnh doanh nghiệp (B)
   └─► Vấn đề / Cơ hội (P)
         └─► Mục tiêu kinh doanh (G)      — đo được, có thời hạn nếu đầu vào có nói
               └─► Câu hỏi kinh doanh (Q)  — trả lời được bằng dữ liệu
                     └─► Quyết định / Hành động của người xem (D)
                           └─► Ứng viên chỉ số (M)  — chỉ tên + ý nghĩa
                                 └─► Tiêu chí thành công (S)
```
Mỗi mũi tên là một quan hệ "vì vậy / để". Nếu không giải thích được mũi tên → nội dung đó đang thiếu logic, hãy ghi vào mục Giả định hoặc bỏ.

## 2. Cách rút thông tin từ đầu vào
| Cần tìm | Tìm ở đâu | Nếu không có |
|---|---|---|
| Ngành, mô hình kinh doanh, quy mô | Ngữ cảnh công ty | `[Thiếu thông tin]` |
| Vấn đề / cơ hội | Ngữ cảnh + yêu cầu phân tích | Suy ra từ yêu cầu, gắn `[Giả định]` |
| Mục tiêu định lượng, thời hạn | Ngữ cảnh / yêu cầu | Không tự đặt con số; ghi "chưa có mục tiêu định lượng" |
| Người ra quyết định | Thông tin người xem | Dùng vị trí + level đã khai báo |
| Dữ liệu có sẵn | Profile dữ liệu | Ghi rõ cột/bảng thiếu |

## 3. Đặt mục tiêu (G) tốt
- Dạng: *[Động từ] + [đối tượng] + [thước đo] + [phạm vi/thời gian nếu có]*. Ví dụ: "Theo dõi tăng trưởng doanh thu theo khu vực để phát hiện khu vực tăng chậm".
- Tối đa 3–5 mục tiêu. Mục tiêu nào không có chỉ số ứng viên → bỏ hoặc gộp.
- Phân biệt **mục tiêu kinh doanh** (tăng doanh thu) với **mục tiêu phân tích** (so sánh doanh thu theo khu vực). Ghi cả hai, nối nhau.

## 4. Đặt câu hỏi (Q) tốt
- Bắt đầu bằng: *Bao nhiêu / Thay đổi thế nào so với… / Ở đâu / Nhóm nào đóng góp nhiều nhất / Vì sao…*
- Mỗi Q thuộc một nhóm để chặng Dashboard chọn biểu đồ: **Tổng quan**, **Xu hướng**, **So sánh**, **Tỷ trọng**, **Phân phối**, **Phân tầng/chi tiết**.
- Kiểm tra: có cột dữ liệu để trả lời không? Nếu không → `[Thiếu dữ liệu]`.

## 5. Quyết định (D)
Hành động cụ thể người xem có thể làm sau khi đọc dashboard (điều chỉnh ngân sách, kiểm tra nhà cung cấp, thưởng/phạt, dừng sản phẩm…). Nếu chỉ để theo dõi, ghi "Theo dõi — không có hành động trực tiếp".

## 6. Cá nhân hóa theo người xem
| Level | Phong cách |
|---|---|
| Intern, Fresher, Junior | Chi tiết, giải thích thuật ngữ, ví dụ cụ thể |
| Middle, Senior, Team Lead, Supervisor | So sánh, nguyên nhân, drill-down |
| Manager, Senior Manager | KPI chính + ngoại lệ + so sánh kỳ trước |
| Director, C-level | Rất ít con số, xu hướng, cảnh báo, mục tiêu vs thực tế |

Thâm niên dài tại doanh nghiệp → người xem quen thuật ngữ nội bộ; thâm niên ngắn → thêm định nghĩa vào mục Thuật ngữ.

## 7. Lỗi thường gặp (tránh)
- Viết mục tiêu chung chung ("nâng cao hiệu quả") không có thước đo.
- Chép nguyên văn đầu vào mà không cấu trúc lại.
- Đưa con số ví dụ không có trong đầu vào.
- Lẫn việc của chặng sau (viết DAX, vẽ biểu đồ) vào chặng này.
