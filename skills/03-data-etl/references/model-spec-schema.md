# Schema `model-spec.json`

Bạn xuất file bằng khối `<<<FILE: model-spec.json>>> … <<<END FILE>>>`. **Mọi trường đều tuỳ chọn** — script `post.js` tự điền từ `data-checks.json` và `clean/*.csv`, rồi ghi lại bản chuẩn.

```jsonc
{
  "modelName": "Doanh_thu_Q1",            // tên mô hình / project (không dấu)
  "tables": [
    {
      "name": "Ban hang",                 // phải khớp tên bảng đã làm sạch
      "role": "fact",                     // "fact" | "dimension"
      "columns": [                        // chỉ liệt kê cột muốn ghi đè
        { "name": "Doanh thu", "format": "#,##0", "description": "Doanh thu sau chiết khấu (VND)", "summarizeBy": "sum" },
        { "name": "Mã SP", "hidden": true, "summarizeBy": "none" }
      ]
    }
  ],
  "relationships": [                      // bỏ trống toàn bộ khoá này = dùng quan hệ tự phát hiện
    { "fromTable": "Ban hang", "fromColumn": "Mã SP",   // phía NHIỀU (FK)
      "toTable": "San pham",   "toColumn": "Mã SP",     // phía MỘT (PK)
      "cardinality": "manyToOne",         // manyToOne | oneToOne | manyToMany
      "crossFilter": "single" }           // single | both
  ],
  "dateColumn": { "table": "Ban hang", "column": "Ngày" },  // cột ngày để nối bảng Calendar
  "notes": ["Ghi chú tuỳ ý"]
}
```

## Script sẽ
- **Giữ kiểu dữ liệu thật** (int / decimal / text / date / datetime / bool) theo dữ liệu đã làm sạch — bỏ qua kiểu bạn đặt nếu khác.
- Loại bảng/cột/quan hệ không tồn tại; loại quan hệ hai cột khác kiểu; loại quan hệ trùng cặp bảng; cảnh báo many-to-many.
- Chọn `summarizeBy`: số đo → `sum`; khóa/ID → `none`. Cột tham gia quan hệ luôn `none`; khóa ngoại ở bảng fact được ẩn.
- Chọn cột ngày mặc định nếu bạn không chỉ định (hoặc chỉ định sai).
- Ghi lại `model-spec.json` chuẩn, kèm `warnings`.

## Kết quả chuẩn (do script ghi) — các trường chính
`modelName`, `tables[{name, file, role, rows, columns[{name, type, summarizeBy, hidden, format, description}]}]`, `relationships[{fromTable, fromColumn, toTable, toColumn, cardinality, crossFilter, source}]`, `dateColumn`, `notes`, `warnings`.
