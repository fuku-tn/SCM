# Evaluator — Chặng 2 · Key Metrics

Một lượt model ĐỘC LẬP (chỉ đọc) chấm `result.md` + `metrics-spec.json`. `[C]` = critical (trượt → FAIL → chạy lại tối đa 2 lần kèm phản hồi).

<!-- AC-BEGIN -->
- AC1 [C] Mỗi Key Metric người dùng chọn có trong `metrics`/`derived` của metrics-spec.json, hoặc có giải thích vì sao không làm được ở mục "Giả định và những việc không thực hiện được".
- AC2 [C] Tên bảng và cột trong spec và trong result.md khớp dữ liệu đã làm sạch (đúng từng ký tự); log post.js không báo "BỎ metric/dimension" vì cột không tồn tại.
- AC3 [C] Phân lập Numerical/Categorical đúng: cột mã/ID là Categorical; phép tính hợp lệ theo loại (không SUM trên mã); log post.js không báo "phép tính không hợp lệ".
- AC4 [C] Chỉ có measure thời gian (LY/LQ/LM/LD/PY/PQ/PM) cho đúng các kỳ người dùng chọn; không chọn kỳ nào thì không có measure thời gian.
- AC5 [C] Mỗi mục tiêu G# của chặng 1 có ít nhất một metric phục vụ, và bản đồ chỉ số ghi rõ G# tương ứng.
- AC6 [C] Mỗi giả thuyết H# của chặng 1 có dòng ở mục "Kiểm chứng giả thuyết" với chỉ số × chiều có thật trong spec (hoặc nêu lý do không kiểm chứng được).
- AC7 Không chọn hai KPI trùng bản chất cho cùng mục đích; Performance (tử/mẫu) có ý nghĩa kinh doanh; tỷ lệ không bị cộng dồn.
- AC8 Phụ lục (h) đủ cho Dashboard: nhóm, pattern (1-1/N-1/1-N/N-N), dimension, measure, biểu đồ gợi ý — nhất quán với các ghép ở mục 7.
- AC9 Spec không chứa DAX tự viết; số liệu/giả định trong result.md không vượt quá dữ liệu có thật (tham khảo F#).
<!-- AC-END -->
