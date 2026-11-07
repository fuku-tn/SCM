---
name: business-goal
title: Business Context
description: Tiếp nhận thông tin doanh nghiệp, yêu cầu phân tích và người xem dashboard; ghi ra file .md có cấu trúc logic (bối cảnh → mục tiêu → câu hỏi → quyết định → tiêu chí thành công) để các chặng sau dùng lại.
knowledge: kpi-selection
---

# SKILL: Business Context (Chặng 1)

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
- Người xem TRỰC TIẾP (Direct — thiết kế cho họ): phòng ban, vị trí, level, giới tính, học vấn, thâm niên tại doanh nghiệp, thâm niên đi làm, ghi chú về người đọc; và người xem GIÁN TIẾP (Indirect — nếu có, có thể nhiều người) với nhu cầu của họ. Giới tính chỉ để ghi nhận hồ sơ, không dùng để suy ra sở thích/năng lực
- Key Metrics, kỳ so sánh, Dimension người dùng đã chọn; profile dữ liệu (chỉ để biết dữ liệu có gì — chưa phân tích sâu)

## Quy trình
1. **Đọc hết** thông tin đầu vào; gạch chân sự kiện, con số, tên riêng thật sự có trong đó.
2. **Dựng chuỗi logic** theo `references/business-goal-framework.md`:
   Bối cảnh → Vấn đề/Cơ hội → Mục tiêu kinh doanh → Câu hỏi kinh doanh → Quyết định của người xem → Ứng viên chỉ số → Tiêu chí thành công.
3. **Gắn mã để truy vết**: mục tiêu `G1, G2…`; câu hỏi `Q1, Q2…`; quyết định `D1, D2…`. Mỗi `Q` ghi rõ phục vụ `G` nào; mỗi `D` ghi rõ dựa vào `Q` nào. Các chặng sau sẽ trích dẫn các mã này.
4. **Cá nhân hóa theo người xem**: level và thâm niên quyết định độ chi tiết (Director/C-level → ít con số, nhiều xu hướng/ngoại lệ; Manager/Lead → so sánh, nguyên nhân; Junior/Fresher → chi tiết, giải thích thuật ngữ).
5. **Đối chiếu yêu cầu với dữ liệu**: chỉ nói được điều dữ liệu cho phép; thiếu thì ghi vào mục Giả định / Rủi ro, không tự bịa.
6. **Viết `result.md`** đúng khung `assets/business-goal-template.md`.

## Dựa trên bằng chứng (EDA)
Prompt có mục **PHÁT HIỆN TỪ DỮ LIỆU** do code tính sẵn (mã `F1, F2…`: ngoại lệ, xu hướng, tập trung, tương quan, chất lượng dữ liệu).
- **Vấn đề / cơ hội `P#`** chỉ được nêu khi có ít nhất một `F#` làm bằng chứng (ghi mã trong cột "Bằng chứng"). Vấn đề lấy từ ngữ cảnh người dùng nhưng chưa có F# → gắn `[Chưa có bằng chứng từ dữ liệu]`.
- **Mục tiêu `G#`** phải chỉ ra giải quyết `P#` nào; **Giả thuyết `H#`** (mục 4b) xuất phát từ `F#` và nêu cách kiểm chứng (chỉ số × chiều). Viết giả thuyết như phỏng đoán, không như kết luận.
- **Chỉ trích con số có trong `F#` hoặc bảng dữ liệu**; tuyệt đối không thêm số khác. Nếu F# nói dữ liệu thiếu/lệch (chất lượng, tháng thiếu) → đưa vào mục 6 làm giới hạn của câu hỏi liên quan (`[Thiếu dữ liệu]`).
- Tương quan ≠ nhân quả; không kết luận nguyên nhân từ một F# duy nhất.

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
- [ ] Mỗi P có mã F# làm bằng chứng; mỗi H có F# và cách kiểm chứng; mã F# trích dẫn có thật trong danh sách phát hiện
- [ ] Không có con số/tên riêng nào ngoài đầu vào mà chưa gắn nhãn Giả định
- [ ] Văn phong phù hợp level + thâm niên của người xem
- [ ] Có chỉ rõ chỉ số/dimension/kỳ so sánh người dùng đã chọn nằm ở mục tiêu nào
