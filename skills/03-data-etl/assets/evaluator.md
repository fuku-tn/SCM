# Evaluator — Chặng 3 · Data (ETL)

Một lượt model ĐỘC LẬP (chỉ đọc) chấm `result.md`, `data-checks.json` (rút gọn) và `model-spec.json`. `[C]` = critical.

<!-- AC-BEGIN -->
- AC1 [C] Đã báo cáo đủ 9 quy tắc R1–R9 với trạng thái rõ ràng; hành động làm sạch khớp data-checks (số dòng trước/sau hợp lý, không xóa dữ liệu thật ngoài dòng trống/tổng/lỗi).
- AC2 [C] Quan hệ: mọi cặp PK/FK trong model-spec tồn tại trong bảng đã làm sạch, kiểu khóa khớp; vấn đề còn lại được nêu rõ (unresolved), không giả vờ đã xử lý.
- AC3 [C] model-spec.json nhất quán với data-checks: tên bảng/cột đúng từng ký tự; phân fact/dimension hợp lý; cột ngày chính (dateColumn) đúng hoặc ghi rõ không có.
- AC4 Giải thích vòng Modeling → Transformation: đã quay lại sửa gì (chuẩn hóa khóa, đồng bộ kiểu) và kết quả sau mỗi vòng.
- AC5 Khóa ngoại mồ côi / khóa trùng được báo số dòng bị ảnh hưởng; không âm thầm xóa.
- AC6 Cảnh báo chất lượng dữ liệu (cột thiếu nhiều, giá trị thay thế, tháng thiếu) được nêu để chặng sau biết.
<!-- AC-END -->
