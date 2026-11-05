---
name: business-goal
title: Business Goal
description: Tiếp nhận thông tin doanh nghiệp, yêu cầu phân tích và người xem dashboard; ghi ra file .md có cấu trúc logic (bối cảnh → mục tiêu → câu hỏi → quyết định → tiêu chí thành công) để các chặng sau dùng lại.
---

# SKILL: Business Goal (Chặng 1)

## Mục đích
Biến thông tin rời rạc người dùng cung cấp (ngữ cảnh công ty, yêu cầu phân tích, thông tin người xem) thành **một tài liệu Markdown duy nhất, logic và dùng lại được** cho Key Metrics, Data (ETL) và Dashboard (PBIP).
Kết quả của chặng này là `result.md` (script tự lưu thêm bản `business-goal.md`).

## Cấu trúc SKILL (bắt buộc)
| Thành phần | Nội dung |
|---|---|
| `SKILL.md` | Hướng dẫn này |
| `references/` | `business-goal-framework.md` — cách đi từ thông tin thô đến chuỗi logic |
| `assets/` | `business-goal-template.md` — khung output bắt buộc |
| `scripts/` | `post.js` — kiểm tra đủ mục, lưu `business-goal.md` |

## Đầu vào (có trong prompt)
- Ngữ cảnh doanh nghiệp (gõ trực tiếp và/hoặc từ file .md/.pdf/.docx)
- Yêu cầu phân tích (gõ và/hoặc từ file)
- Người xem dashboard: phòng ban, vị trí, level, thâm niên tại doanh nghiệp, thâm niên đi làm
- Key Metrics, kỳ so sánh, Dimension người dùng đã chọn; profile dữ liệu (chỉ để biết dữ liệu có gì — chưa phân tích sâu)

## Quy trình
1. **Đọc hết** thông tin đầu vào; gạch chân sự kiện, con số, tên riêng thật sự có trong đó.
2. **Dựng chuỗi logic** theo `references/business-goal-framework.md`:
   Bối cảnh → Vấn đề/Cơ hội → Mục tiêu kinh doanh → Câu hỏi kinh doanh → Quyết định của người xem → Ứng viên chỉ số → Tiêu chí thành công.
3. **Gắn mã để truy vết**: mục tiêu `G1, G2…`; câu hỏi `Q1, Q2…`; quyết định `D1, D2…`. Mỗi `Q` ghi rõ phục vụ `G` nào; mỗi `D` ghi rõ dựa vào `Q` nào. Các chặng sau sẽ trích dẫn các mã này.
4. **Cá nhân hóa theo người xem**: level và thâm niên quyết định độ chi tiết (Director/C-level → ít con số, nhiều xu hướng/ngoại lệ; Manager/Lead → so sánh, nguyên nhân; Junior/Fresher → chi tiết, giải thích thuật ngữ).
5. **Đối chiếu yêu cầu với dữ liệu**: chỉ nói được điều dữ liệu cho phép; thiếu thì ghi vào mục Giả định / Rủi ro, không tự bịa.
6. **Viết `result.md`** đúng khung `assets/business-goal-template.md`.

## Quy tắc "ghi một cách logic"
- Mỗi mục tiêu phải **đo được** (có chỉ số ứng viên + hướng tốt/xấu) và **có người ra quyết định**.
- Mỗi câu hỏi phải **trả lời được bằng dữ liệu đang có**; nếu không → đánh dấu `[Thiếu dữ liệu]`.
- Không có mục tiêu "mồ côi": mọi G có ≥ 1 Q; mọi Q có ≥ 1 D hoặc nêu rõ "chỉ để theo dõi".
- Mọi thông tin không có trong đầu vào phải gắn nhãn **[Giả định]** (kèm lý do) hoặc **[Thiếu thông tin]**. Tuyệt đối không bịa số liệu, tên, mục tiêu định lượng.
- Giữ nguyên thuật ngữ chuyên ngành (KPI, YoY, dashboard…) theo CLAUDE.md; tiếng Việt cho phần còn lại.
- Ứng viên chỉ số chỉ ghi **tên + ý nghĩa**; **không** viết DAX hay phân loại Numerical/Categorical (đó là việc của chặng 2).

## Output
- Trả về **Markdown** theo đúng khung `assets/business-goal-template.md` (đủ 8 mục, giữ nguyên tên heading vì `post.js` kiểm tra).
- Không xuất khối `<<<FILE>>>` nào ở chặng này.
- Độ dài gợi ý: 600–1.400 từ; ưu tiên bảng cho G/Q/D.

## Tự kiểm tra trước khi trả lời
- [ ] Đủ 8 mục, đúng tên heading
- [ ] Mỗi G có Q, mỗi Q có D (hoặc ghi rõ lý do)
- [ ] Không có con số/tên riêng nào ngoài đầu vào mà chưa gắn nhãn Giả định
- [ ] Văn phong phù hợp level + thâm niên của người xem
- [ ] Có chỉ rõ chỉ số/dimension/kỳ so sánh người dùng đã chọn nằm ở mục tiêu nào
