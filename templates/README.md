# templates/

Thư viện **template Power BI** (`.pbix`) cho chặng **Dashboard (PBIP)**.

## Cách hoạt động
- Mỗi file `.pbix` ở đây (kể cả trong thư mục con, ví dụ `Power BI Template/Dashboard HR.pbix`) hiện thành một thẻ để người dùng **chọn 1 template** ở bước 4 của trang **Analysis**.
- File phải được lưu ở **định dạng PBIR** (Power BI Desktop → Options → Preview features → *Store reports using enhanced metadata format (PBIR)*), tức bên trong `.pbix` có thư mục `Report/definition/`.
- Khi chạy, BIE giữ nguyên giao diện của template (nền, hình, logo, nút chuyển trang, màu theme, định dạng biểu đồ) và **gắn lại dữ liệu của người dùng** vào các biểu đồ dữ liệu.
- Id của template = tên file bỏ chữ "Dashboard" ở đầu (vd. `Dashboard HR.pbix` → `hr`).
- Template được giải nén một lần vào `templates/.cache/` (tự tạo lại khi file thay đổi; không đưa lên git).

## Thêm template mới
1. Lưu dashboard mẫu thành `.pbix` (PBIR) và thả vào thư mục này.
2. Tải lại trang Analysis → thẻ template mới xuất hiện.
3. Lưu ý: bookmark, drillthrough, bộ lọc riêng và custom visual của template **không** được mang theo.

## Template do người dùng tải lên
Ngoài các template trong thư mục này, ở bước 4 của Analysis người dùng có thể **tải file `.pbix` của riêng họ** (PBIR, < 100MB). File được lưu theo phiên (`output/<run-id>/00-input/pbix/`), giải nén vào `templates/.cache/` và dùng như template thường; không đưa vào thư viện chung.
Template chỉ có 1 trang vẫn dùng được: BIE **nhân bản trang** để đủ trang phân tích (`pages.clones` trong dashboard-spec).
