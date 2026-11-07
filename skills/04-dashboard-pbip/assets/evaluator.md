# Evaluator — Chặng 4 · Dashboard (PBIP)

Một lượt model ĐỘC LẬP (chỉ đọc) chấm `result.md`, `dashboard-spec.json`, `pbip-validation.md` và log post.js. `[C]` = critical.

<!-- AC-BEGIN -->
- AC1 [C] Bản dựng PBIP hợp lệ: `pbip-validation.md`/post.log báo 0 vấn đề cấu trúc; project có thư mục dữ liệu `data/` kèm file CSV.
- AC2 [C] Mỗi trang có 4–6 thẻ KPI tổng quan (không vượt 6).
- AC8 [C] Ngôn ngữ dashboard đúng lựa chọn của người dùng (prompt/`run.json`: English hoặc Tiếng Việt): tên measure, tiêu đề trang/biểu đồ, textbox, referenceTitle không lẫn ngôn ngữ khác (tên bảng/cột của dữ liệu được giữ nguyên).
- AC3 [C] Mọi measure và cột dùng trong dashboard-spec tồn tại trong measures.json/model-spec (đúng từng ký tự); không bịa measure/cột.
- AC4 [C] Dashboard bám Business Context: các mục tiêu G#/câu hỏi Q# chính có ít nhất một trang/biểu đồ trả lời; nếu người dùng chọn template thì giữ giao diện template (không tự đổi bố cục/màu ngoài lựa chọn).
- AC5 Phù hợp hồ sơ người xem (số trang, số KPI, mức chi tiết); các cảnh báo "Người xem:" nếu có được giải thích hoặc chấp nhận hợp lý.
- AC6 Chọn biểu đồ đúng câu hỏi (viz-craft/IBCS): tiêu đề nêu thông điệp, sắp xếp hợp lý, không pie quá 5 lát, không trộn đơn vị trên một thẻ.
- AC7 result.md nêu rõ cách mở (bấm Refresh lần đầu, DataFolder/SetDataFolder.ps1), cảnh báo và giả định.
- AC9 [C] Nếu có "Bố cục dashboard người dùng đã duyệt": số trang/thứ tự, trang nguồn template (kể cả bản nhân bản), loại biểu đồ, Top N và tiêu đề khớp bố cục đó (post.log không cảnh báo lệch số trang); các góp ý của người dùng được thể hiện. Không có bố cục duyệt thì bỏ qua tiêu chí này (coi là đạt).
<!-- AC-END -->
