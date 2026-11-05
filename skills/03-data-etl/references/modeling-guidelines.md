# Hướng dẫn Modeling (nhiều bảng)

## 1. Vai trò bảng
- **Fact**: nhiều dòng, chứa số đo + khóa ngoại + ngày (đơn hàng, giao dịch…).
- **Dimension**: ít dòng hơn, mô tả (sản phẩm, khách hàng, khu vực…), có khóa chính duy nhất.
- Mục tiêu: **star schema** — fact ở giữa, dimension xung quanh, quan hệ **nhiều–một**, lọc **một chiều** (dimension → fact).

## 2. Primary Key (PK) – phía "một"
Phải: (a) **duy nhất**, (b) **không trống**, (c) cùng kiểu với FK.
Vi phạm thường gặp → cách xử lý (quay lại Transformation):
| Vấn đề | Nguyên nhân | Xử lý |
|---|---|---|
| Khóa bị trùng | Dòng trùng 100%; cùng mã khác tên | Xóa dòng trùng; nếu khác nhau thật → cần người quyết định |
| Khóa trống | Thiếu mã | Loại dòng hoặc bổ sung — **không** điền "Unknown" |
| Khác định dạng | Khoảng trắng thừa, hoa/thường, số 0 đầu (`001` vs `1`), kiểu số vs chữ | Chuẩn hóa khóa (cắt khoảng trắng → bỏ phân biệt hoa/thường → bỏ số 0 đầu) |

## 3. Foreign Key (FK) – phía "nhiều"
- Mọi giá trị FK phải **tìm thấy** ở PK. Giá trị không tìm thấy = **orphan** → các dòng đó mất khi lọc theo dimension.
- Báo: số giá trị orphan, số dòng bị ảnh hưởng, nguyên nhân (định dạng / thật sự thiếu trong dimension).
- Orphan thật (dimension thiếu mã): đề xuất **bổ sung dòng vào dimension**; không tự bịa.
- FK trống: nêu số lượng; không điền giá trị thay thế.

## 4. Cardinality
| Kiểu | Khi nào | Lưu ý |
|---|---|---|
| `manyToOne` | FK (nhiều) → PK (một) | Chuẩn mong muốn |
| `oneToOne` | Cả hai phía duy nhất | Cân nhắc gộp bảng |
| `manyToMany` | Cả hai phía trùng | Tránh; tạo bảng dimension trung gian có khóa duy nhất |

## 5. Quy tắc mô hình
- Không tạo hai đường quan hệ giữa cùng một cặp bảng (mơ hồ).
- Không vòng lặp giữa các bảng.
- Một cột ngày chính ở bảng fact để nối với bảng `Calendar` (chặng Dashboard tự tạo); mọi so sánh LY/LQ/LM/LD dựa vào đó.
- Khóa ngoại ở bảng fact nên ẩn khỏi người dùng; số đo mới cộng dồn (`sum`), khóa/ID **không** cộng dồn.

## 6. Vòng lặp "quay lại Transformation"
```
Kiểm tra quan hệ → có vấn đề khóa?
   ├─ không  → kết luận mô hình dùng được
   └─ có     → chuẩn hóa khóa / bỏ dòng trùng / đồng bộ kiểu → kiểm tra lại (tối đa 3 vòng)
                 └─ vẫn còn → báo "chưa xử lý được" + đề xuất cho người dùng
```
`pre.js` đã thực hiện các vòng tự động; bạn tóm tắt từng vòng và nêu phần còn lại.

## 7. Sơ đồ quan hệ (Mermaid)
```
erDiagram
    SAN_PHAM ||--o{ BAN_HANG : "Mã SP"
```
`||--o{` = một–nhiều (phía `||` là PK). Dùng tên bảng đã bỏ khoảng trắng/dấu.
