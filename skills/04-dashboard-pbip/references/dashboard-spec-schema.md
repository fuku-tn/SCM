# Schema `dashboard-spec.json`

Bạn xuất file bằng khối `<<<FILE: dashboard-spec.json>>> … <<<END FILE>>>`. Script `post.js` đọc file này cùng `model-spec.json` và `measures.json` rồi dựng PBIP.

Có **hai chế độ**: (A) **template** — khi người dùng đã chọn template Power BI (mặc định); (B) không template — tự bố cục theo lưới (phần "Không template" bên dưới).

## A. Chế độ template
```jsonc
{
  "template": "sale",                          // id template người dùng chọn (có trong prompt)
  "projectName": "Banle_PhongCach",            // không dấu
  "pages": { "keep": ["Home", "Overview"] },   // tên hoặc số trang; bỏ trống = giữ mọi trang không phải Tooltip
  "bind": {                                    // gắn dữ liệu cho BIỂU ĐỒ DỮ LIỆU (key lấy từ bảng template)
    "2.56ba69": {
      "title": "Doanh thu",                    // tuỳ chọn; "" = ẩn tiêu đề
      "subtitle": "VND",                       // tuỳ chọn
      "roles": { "Data": ["Doanh thu (SUM)"] },// tên vai trò đúng như template; measure = chuỗi, cột = {table, column}
      "reference": "Doanh thu (SUM) Delta % LM",   // chỉ cardVisual: measure hiển thị ở nhãn tham chiếu
      "referenceTitle": "So với tháng trước: "
    },
    "2.e9ae97": {
      "roles": {
        "Category": [{ "table": "Calendar", "column": "YearMonth" }],
        "Y": ["Doanh thu (SUM)"], "Y2": ["Số đơn hàng (DISTINCTCOUNT)"]
      }
    }
  },
  "texts": { "2.c87aa2": "Tổng quan hiệu suất bán hàng" },   // thay chữ textbox; \n = xuống dòng
  "drop": ["2.f9a724"]                         // bỏ biểu đồ / textbox / hình (key). Biểu đồ dữ liệu không có trong "bind" cũng bị bỏ
}
```
- Biểu đồ dữ liệu **không có** trong `bind` → bị bỏ (kèm khung nền phía sau nếu không còn biểu đồ nào dùng nó).
- Trường không tồn tại / sai loại → bị bỏ khỏi vai trò, nếu vai trò rỗng thì cả biểu đồ bị bỏ (có cảnh báo).
- Không có `bind` hợp lệ → script **tự gắn mặc định** (kết quả dùng được nhưng kém thông minh).
- Chi tiết: `template-guide.md`.

## B. Không template (bố cục theo lưới)

```jsonc
{
  "projectName": "Doanh_thu_Q1",          // tên thư mục / file .pbip (không dấu)
  "title": "Báo cáo doanh thu Q1",
  "pages": [
    {
      "id": "overview",                   // duy nhất
      "name": "Tổng quan",                // tên hiển thị của trang
      "visuals": [
        {
          "id": "kpi1",                   // duy nhất trong trang
          "type": "card",                 // xem bảng loại visual bên dưới
          "title": "Doanh thu tháng này tăng 12% so với tháng trước",
          "subtitle": "VND",              // tuỳ chọn (đơn vị)
          "measures": ["Doanh thu (SUM)"],
          "grid": { "col": 0, "row": 0, "w": 3, "h": 2 }
        },
        {
          "id": "trend", "type": "lineChart", "title": "Doanh thu theo tháng",
          "category": { "table": "Calendar", "column": "YearMonth" },
          "measures": ["Doanh thu (SUM)", "Doanh thu (SUM) LM"],
          "grid": { "col": 0, "row": 2, "w": 7, "h": 5 }
        }
      ]
    }
  ]
}
```

## Lưới bố cục
Trang 1280 × 720 px, lưới **12 cột × 12 hàng**, lề 16 px, khe 8 px (mỗi ô ≈ 97 × 50 px).
`grid`: `col` (0–11), `row` (0–11), `w` (số cột), `h` (số hàng). Phần vượt khung bị cắt.

## Loại visual và trường dữ liệu
| `type` | Trường dùng | Ghi chú |
|---|---|---|
| `card` | `measures` (1) | KPI |
| `clusteredColumnChart`, `clusteredBarChart`, `stackedColumnChart`, `stackedBarChart`, `hundredPercentStackedColumnChart`, `hundredPercentStackedBarChart` | `category`, `measures`, `series` (tuỳ chọn, legend) | Cột/thanh |
| `lineChart`, `areaChart` | `category`, `measures`, `series` | Xu hướng |
| `lineClusteredColumnComboChart` | `category`, `measures` (cột), `lineMeasures` (đường) | Không dùng trục phụ hiển thị |
| `donutChart`, `pieChart` | `category`, `measures` (1) | ≤ 4 phần |
| `treemap` | `category`, `measures` (1) | |
| `scatterChart` | `x`, `y` (tên measure), `size` (measure, tuỳ chọn), `category` (chi tiết) | Phân phối |
| `waterfallChart` | `category`, `measures` | Phân tầng |
| `funnel` | `category`, `measures` | |
| `tableEx` | `columns` [{table,column}], `measures` | Bảng chi tiết |
| `slicer` | `field` {table,column} | Lọc |

## Tham chiếu dữ liệu
- **Measure**: dùng đúng *tên* trong `measures.json` (vd. `"Doanh thu (SUM)"`, `"Doanh thu (SUM) Delta % LM"`). Tên sai → measure bị bỏ khỏi visual.
- **Cột**: `{ "table": "...", "column": "..." }` đúng tên trong `model-spec.json`.
- **Bảng ngày `Calendar`** (có khi mô hình có cột ngày) cung cấp: `Date`, `Year`, `Quarter` (Q1..), `Month` (Jan..), `MonthNo`, `YearQuarter` (2026-Q1), `YearMonth` (2026-01), `Day`. Dùng `YearMonth`/`YearQuarter`/`Year` làm trục thời gian (tự sắp tăng dần).
- Trục danh mục phi thời gian tự sắp **giảm dần theo measure đầu tiên** (IBCS).

## Script tự áp dụng (IBCS tối giản)
Tắt lưới và trục giá trị (dùng nhãn trực tiếp), bật data labels, đường không marker, ẩn chú giải khi chỉ có 1 series, nền/viền trong suốt, tiêu đề theo `title`.

## Script sẽ
- Bỏ visual có `type` không hỗ trợ hoặc không còn measure/cột hợp lệ (ghi cảnh báo).
- Tự sinh dashboard mặc định (KPI + xu hướng + so sánh + bảng) nếu file không có/hỏng.
- Dựng: `.pbip`, Report (PBIR), Semantic Model (TMDL, gồm bảng `Calendar` + quan hệ + measure), `data/*.csv`, README, `pbip-validation.md`.
