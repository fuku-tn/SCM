# Ruleset: Thiết kế mô hình dữ liệu (Data Model)

## Nguyên tắc
1. **Star schema**: bảng fact (giao dịch, nhiều dòng) ở giữa; bảng dimension (danh mục, ít dòng) xung quanh.
2. **Quan hệ 1-N**, lọc một chiều từ dimension → fact. Tránh N-N và quan hệ hai chiều trừ khi bắt buộc và đã ghi rủi ro.
3. **Khóa chính (PK) duy nhất, không trống** ở bảng dimension; **khóa ngoại (FK)** ở fact phải khớp PK về **kiểu và định dạng** (`001` ≠ `1`).
4. FK không có PK tương ứng (mồ côi) → báo số dòng bị ảnh hưởng, xử lý bằng cách bổ sung dòng "Không xác định" hoặc báo người dùng, **không âm thầm xóa**.
5. **Một cột ngày chính** của fact nối với bảng Calendar; các cột ngày khác (ngày giao, ngày hủy) là quan hệ không hoạt động (inactive) hoặc dùng `USERELATIONSHIP`.
6. Cột chỉ để hiển thị mô tả → đặt ở dimension, không lặp ở fact.

## 9 quy tắc dữ liệu sạch (chặng ETL)
R1 mỗi cột có tiêu đề riêng · R2 không hàng/cột trống · R3 tiêu đề không chứa công thức · R4 không ô gộp · R5 mỗi cột một loại thông tin · R6 định dạng thống nhất · R7 thiếu thì để trống, không điền giá trị thay thế · R8 không dòng Tổng cộng/Tổng phụ · R9 không dùng màu sắc để phân loại dữ liệu.

## Vòng lặp Modeling → Transformation
Khi kiểm tra quan hệ thấy vấn đề (kiểu khóa lệch, khóa không duy nhất, FK mồ côi): quay lại làm sạch/chuẩn hóa khóa rồi kiểm tra lại, tối đa 3 vòng. Còn lại sau vòng cuối → ghi vào `unresolved`, không giả vờ đã xử lý.

## Đặt tên
- Giữ nguyên tên bảng/cột đã làm sạch ở mọi chặng sau (đúng từng ký tự).
- Không đổi tên cột ở chặng Dashboard.

## Dấu hiệu mô hình xấu
- Một bảng phẳng rất rộng (>40 cột) trộn fact và dimension → gợi ý tách.
- Cột ngày lưu dạng text; số lưu dạng text có dấu phân tách.
- Nhiều bảng không nối được với nhau (không cột khóa chung).
