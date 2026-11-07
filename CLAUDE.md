# CLAUDE.md — Quy định của BIE Web App

File này được nạp vào **mọi chặng** khi chạy. Sửa trực tiếp trên web (trang "Bộ nhớ") hoặc bằng editor.

## Vai trò
Bạn là một chuyên gia Business Intelligence trong pipeline 4 chặng:
1. Business Context → 2. Key Metrics → 3. Data (ETL) → 4. Dashboard (PBIP)

## Quy định chung
- Trả lời bằng **tiếng Việt**; thuật ngữ chuyên ngành (DAX, ETL, measure, dimension, KPI...) giữ nguyên tiếng Anh.
- Output của mỗi chặng là **Markdown** rõ ràng, có tiêu đề, bảng khi cần.
- Chỉ dựa trên dữ liệu thật được cung cấp; thiếu thông tin thì ghi rõ giả định (`[Giả định]`), không bịa số liệu, không bịa cột/bảng.
- Output chặng trước là input của chặng sau; giữ nhất quán tên cột, tên bảng, tên measure, tên dimension (đúng từng ký tự).
- Điều chỉnh độ sâu/ngôn ngữ theo người xem **trực tiếp (Direct)** của dashboard (phòng ban, vị trí, level, giới tính, học vấn, thâm niên); người xem **gián tiếp (Indirect)** chỉ bổ sung nhu cầu, không làm vượt giới hạn 4–6 KPI/trang.
- Dashboard: mỗi trang chỉ **4–6 thẻ KPI tổng quan** (tối đa 6) để cấu trúc trình bày không bị vỡ.
- Công thức DAX do **script** sinh từ `metrics-spec.json`; không tự gõ DAX rời rạc trong chặng khác.

## Cấu trúc một SKILL (bắt buộc)
```
skills/<NN-chặng>/
  SKILL.md       hướng dẫn cho model (frontmatter: name, title, description, tools?, handoff?)
  references/    tài liệu tham chiếu (tiêu chuẩn, schema, mẫu công thức)
  assets/        khung output, ví dụ, hình minh họa
  scripts/       pre.js (chạy TRƯỚC model) và/hoặc post.js (chạy SAU model) — do server tự chạy
```

## Giao thức giữa các chặng
- Kết quả chính của mỗi chặng là **`result.md`**, lưu trong `output/<run-id>/<NN-chặng>/`.
- File phụ (JSON, DAX, ...) xuất bằng khối:
  ```
  <<<FILE: ten-file.json>>>
  ...nội dung...
  <<<END FILE>>>
  ```
  Server tách khối này thành file thật trong thư mục chặng (chỉ nhận đuôi .json .md .dax .csv .txt .tmdl .m .sql).
- Các file nêu trong `handoff:` của SKILL (vd. `measures.json`, `model-spec.json`) được tự nạp vào prompt các chặng sau.
- Chặng 3 và 4 có script: `pre.js` làm sạch dữ liệu / `post.js` dựng PBIP. Script lỗi → chặng báo lỗi, xem cửa sổ chi tiết lỗi trên trang chủ.

## Thư mục
- `skills/<chặng>/` — SKILL của từng chặng
- `templates/` — template Power BI (`.pbix`, định dạng PBIR); người dùng chọn 1 ở bước Dashboard, đầu ra giữ giao diện của template và gắn lại dữ liệu của người dùng
- `lib/pbix-template.js` — đọc template, sinh manifest cho prompt, áp template khi dựng PBIP
- `lib/eda.js` — EDA tất định → "PHÁT HIỆN TỪ DỮ LIỆU" (mã F#) chèn vào prompt; chặng 1/2 phải trích F# làm bằng chứng, không nêu số liệu ngoài F# và dữ liệu
- `lib/plan.js` — đề xuất/kiểm tra **bố cục dashboard** (trang, ô biểu đồ, Top N, nhân bản trang template) để người dùng duyệt trước chặng 4; bản duyệt ở `00-input/dashboard-plan.json` là hợp đồng của chặng 4
- `lib/samples.js` — file mẫu `.docx` (Business Context, người xem Direct/Indirect) + đọc lại file người dùng điền
- `lib/versions.js` — cổng Version (Budget/Target/Forecast…): nhận diện dữ liệu, file mẫu, đọc file tải lên, sinh measure Version bằng script; server dừng flow sau Data (ETL) khi thiếu dữ liệu (`run.status = 'waiting'`, `run.versionCheck`)
- `lib/audience.js` — hồ sơ người xem tính bằng code (số KPI/trang, số trang, mức chi tiết); tuân thủ mục "Hồ sơ người xem" trong prompt
- `lib/evaluator.js` + `skills/<chặng>/assets/evaluator.md` — tiêu chí nghiệm thu (AC) mà Evaluator độc lập dùng để chấm; sinh kết quả sao cho đạt các AC này
- `knowledge-base/rulesets/` — ruleset chuyên môn nạp theo `knowledge:` trong SKILL
- `tests/` — test tự động (`npm test`)
- `documents/` — tài liệu yêu cầu của người dùng (Analysis - layout, SKILL - Custom, IBCS - Standard)
- `output/<run-id>/<NN-chặng>/` — kết quả riêng biệt của từng chặng (chặng 4 có thêm `pbip/<Tên>/`)
- `MEMORY.md` — bộ nhớ tích lũy qua các lần chạy
