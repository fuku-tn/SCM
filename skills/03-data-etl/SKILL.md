---
name: data-etl
title: Data (ETL)
description: Làm sạch dữ liệu theo 9 quy tắc dữ liệu dạng bảng (Transformation) và kiểm tra mô hình nhiều bảng — quan hệ, Primary Key / Foreign Key — quay lại Transformation nếu khóa có vấn đề (Modeling).
handoff: model-spec.json
---

# SKILL: Import Data — Transformation & Modeling (Chặng 3)

## Mục đích
Đưa dữ liệu thô người dùng tải lên về **dạng bảng sạch, đúng chuẩn** và xác nhận **mô hình dữ liệu tính toán được** (đặc biệt các quan hệ giữa bảng). Nếu khóa có lỗi, phải **quay lại Transformation** xử lý rồi mới kết luận.

## Cách chặng này chạy (khác các chặng khác)
Phần nặng và cần chính xác do **script** làm; bạn (model) là người **rà soát, quyết định mô hình và giải thích**:
1. `scripts/pre.js` chạy **trước** lượt của bạn: làm sạch từng bảng/sheet đã chọn theo 9 quy tắc, ghi `clean/<bảng>.csv`, kiểm tra quan hệ PK/FK và **tự lặp tối đa 3 vòng** (chuẩn hóa khóa, bỏ dòng trùng, đồng bộ kiểu). Kết quả được đưa vào prompt ở mục **"KẾT QUẢ SCRIPT TIỀN XỬ LÝ"** và lưu `data-checks.json`.
2. **Bạn** đọc kết quả đó, đối chiếu với Key Metrics (chặng 2), quyết định mô hình, viết `result.md` và `model-spec.json`.
3. `scripts/post.js` chạy **sau** lượt của bạn: kiểm tra `model-spec.json` với dữ liệu thật, loại phần sai, chuẩn hóa thành spec để chặng Dashboard dựng semantic model.

## Cấu trúc SKILL (bắt buộc)
| Thành phần | Nội dung |
|---|---|
| `SKILL.md` | Hướng dẫn này |
| `references/` | `tabular-data-rules.md`, `modeling-guidelines.md`, `model-spec-schema.md` |
| `assets/` | `result-template.md`, `model-spec.example.json` |
| `scripts/` | `pre.js` (làm sạch + kiểm tra khóa), `post.js` (chuẩn hóa model-spec) |

## 9 quy tắc sau khi xử lý xong dữ liệu (bắt buộc)
1. Mỗi cột có tiêu đề riêng.
2. Không để trống hoàn toàn tiêu đề, hàng hoặc cột.
3. Tiêu đề cột không chứa công thức.
4. Không dùng ô gộp (Merged Cells).
5. Mỗi cột chỉ chứa một loại thông tin.
6. Mỗi cột một định dạng thống nhất (dạng bảng – Tabular Form).
7. Không có dữ liệu thì để trống ô, không điền giá trị thay thế (N/A, -, 0, "không có"…).
8. Không dùng dòng Tổng cộng (Grand Total) hoặc Tổng phụ (Sub Total).
9. Không dùng định dạng trình bày (màu sắc, kiểu chữ, tô màu…) để phân loại dữ liệu.

Chi tiết cách kiểm tra/sửa: `references/tabular-data-rules.md`.

## Quy trình của bạn
1. **Đọc kết quả pre.js**: với mỗi bảng, rà bảng 9 quy tắc (✅ đạt / 🛠 đã sửa / ⚠ còn vấn đề). Nhắc lại các hành động đã làm.
2. **Đối chiếu Key Metrics**: mỗi cột mà chặng 2 dùng (numerical/categorical/date) có tồn tại, đúng kiểu, ít trống không? Cột numerical bị nhận là text, cột ngày không nhận ra… → đưa vào "Vấn đề cần xử lý" kèm đề xuất.
3. **Modeling** (nhiều bảng): xác định vai trò **fact/dimension**, danh sách quan hệ, cardinality; kiểm tra **Primary Key** (duy nhất, không trống) và **Foreign Key** (khóa ngoại phải tìm thấy ở PK — orphan). Mô tả các vòng quay lại Transformation mà script đã làm và phần còn tồn đọng.
4. **Một bảng**: ghi rõ không cần quan hệ; vẫn xác định cột ngày cho time intelligence.
5. **Kết luận**: dữ liệu **sẵn sàng / chưa sẵn sàng** để tính toán; nếu chưa — nêu chính xác bước người dùng cần làm.
6. **Xuất `model-spec.json`** (chỉ cần ghi phần bạn muốn ghi đè; phần còn lại script tự điền từ dữ liệu thật) — xem `references/model-spec-schema.md`.

## Quy tắc
- Không bịa dữ liệu, không "sửa" số. Chỉ tin `clean/*.csv` và `data-checks.json`.
- Không điền giá trị thay thế vào ô trống (quy tắc 7), kể cả để vá orphan của khóa ngoại; đề xuất thêm dòng vào bảng dimension thay vì đặt "Unknown".
- Mô hình ưu tiên **star schema**: quan hệ nhiều–một (fact → dimension), một chiều lọc, không vòng lặp, không nhiều–nhiều nếu tránh được.
- Kiểu hai cột khóa của một quan hệ phải trùng nhau (script đã đồng bộ).
- Không tự viết Power Query M; chặng Dashboard sinh M từ `model-spec.json` và `clean/*.csv`.

## Output
1. **`result.md`** theo `assets/result-template.md` (có sơ đồ quan hệ dạng Mermaid `erDiagram`).
2. **Khối file**:
```
<<<FILE: model-spec.json>>>
{ ... }
<<<END FILE>>>
```
Nếu bạn đồng ý hoàn toàn với mô hình script đề xuất, vẫn xuất `model-spec.json` tối thiểu (`{"modelName": "..."}`).

## Tự kiểm tra
- [ ] Có bảng 9 quy tắc cho từng bảng
- [ ] Mọi cột chặng 2 cần đều được rà
- [ ] Mỗi quan hệ có cardinality + kết quả kiểm tra PK/FK + orphan
- [ ] Nêu rõ vấn đề tồn đọng và đề xuất, hoặc khẳng định không còn
- [ ] `model-spec.json` hợp lệ
