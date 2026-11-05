# 9 quy tắc dữ liệu dạng bảng — cách kiểm tra và cách sửa

| # | Quy tắc | Dấu hiệu vi phạm | Cách sửa | `pre.js` làm gì |
|---|---|---|---|---|
| R1 | Mỗi cột có tiêu đề riêng | Cột có dữ liệu nhưng ô tiêu đề trống; tiêu đề trùng nhau | Đặt tên có nghĩa; trùng thì thêm hậu tố | Đặt `Column<n>`; trùng → `_2`, `_3` |
| R2 | Không có tiêu đề / hàng / cột trống hoàn toàn | Hàng, cột trắng xen giữa; nhiều dòng tiêu đề báo cáo phía trên | Xóa hàng/cột trắng; bỏ dòng tiêu đề/ghi chú phía trên bảng | Tự xóa; tìm dòng tiêu đề thật |
| R3 | Tiêu đề cột không chứa công thức | Ô tiêu đề bắt đầu bằng `=` / có công thức | Thay bằng giá trị | Dùng giá trị của ô |
| R4 | Không dùng ô gộp | Ô gộp theo chiều dọc (nhóm lặp) hoặc ngang (tiêu đề nhóm) | Bỏ gộp, **điền lại** giá trị ở mọi ô | Gỡ gộp + điền xuống |
| R5 | Mỗi cột chỉ một loại thông tin | Cột "Địa chỉ + SĐT"; cột trộn số và chữ | Tách thành nhiều cột; số ↔ chữ về một loại | Cảnh báo cột trộn (cần người/model quyết định tách) |
| R6 | Mỗi cột một định dạng thống nhất | Ngày lúc `15/01/2026`, lúc `2026-01-15`; số lúc `1.500` lúc `1500`; số lưu dạng chữ | Chuẩn hóa: ngày `yyyy-mm-dd`, số dạng số (dấu `.` thập phân), mã giữ dạng chữ | Chuẩn hóa ngày/số; mã có số 0 đầu giữ nguyên là chữ |
| R7 | Không dữ liệu → để trống | `N/A`, `-`, `null`, `none`, `không có`, `?`, `#N/A` | Xóa trống ô | Chuyển thành ô trống |
| R8 | Không dòng Tổng cộng / Tổng phụ | Dòng "Tổng cộng", "Subtotal"; dòng cuối = tổng các dòng trên | Xóa dòng (Power BI tự tính tổng) | Xóa theo nhãn + kiểm tra tổng ở dòng cuối |
| R9 | Không dùng định dạng để phân loại | Tô vàng = "ưu tiên"; chữ đỏ = "lỗi" | Tạo cột phân loại thật (vd. `Trạng thái`) | Cảnh báo nếu một cột có ≥ 2 màu nền (chỉ kiểm tra màu nền ô Excel) |

## Ghi chú về định dạng ngày
- Chuỗi `dd/mm/yyyy` được hiểu theo **ngày/tháng/năm** (Việt Nam); nếu thành phần thứ hai > 12 mà thứ nhất ≤ 12 thì hiểu ngược lại. Báo trong `Hành động đã thực hiện`.
- Số serial Excel chỉ đổi sang ngày khi tên cột gợi ý ngày (ngày, date, kỳ…).
- Ngày giờ giữ cả giờ (`datetime`); mô hình dùng cột ngày (date) cho bảng Calendar.

## Những gì script KHÔNG tự làm được (bạn phải nêu trong "Vấn đề cần xử lý")
- Tách một cột chứa nhiều loại thông tin (R5).
- Phân loại theo màu chữ / kiểu chữ (R9) — script chỉ nhận ra màu nền.
- Nhập sai chính tả giá trị phân loại (vd. "Hà Nội" / "Ha Noi" / "HN") → đề xuất bảng ánh xạ.
- Dữ liệu ngoại lệ (giá trị âm bất thường, ngày tương lai…) → chỉ nêu ra, không tự sửa.
