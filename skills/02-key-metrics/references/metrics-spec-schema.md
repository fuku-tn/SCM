# Schema `metrics-spec.json`

Bạn xuất file này bằng khối `<<<FILE: metrics-spec.json>>> … <<<END FILE>>>`. Script `post.js` đọc, kiểm tra với profile dữ liệu và sinh `measures.json` / `measures.dax`.

```jsonc
{
  "metrics": [                                  // BẮT BUỘC, ≥ 1
    {
      "id": "rev",                              // ngắn, không dấu, duy nhất
      "label": "Doanh thu",                     // tên hiển thị (tiếng Việt)
      "kind": "numerical",                      // "numerical" | "categorical"
      "table": "Ban hang",                      // = tên sheet / bảng trong profile
      "column": "Doanh thu",                    // = tên cột trong profile
      "aggregations": ["SUM", "AVG", "MAX"],    // numerical: SUM MAX MIN AVG MEDIAN RANGE
                                                // categorical: COUNT DISTINCTCOUNT
      "format": "#,##0",                        // tuỳ chọn
      "unit": "VND"                             // tuỳ chọn
    }
  ],
  "derived": [                                  // tuỳ chọn: phái sinh giữa các measure
    { "id": "profit", "label": "Lợi nhuận", "expression": "{rev.SUM} - {cost.SUM}", "format": "#,##0" }
  ],
  "performance": [                              // tuỳ chọn: SUM / COUNT hoặc DISTINCTCOUNT
    { "id": "rev_per_cust", "label": "Doanh thu / khách", "numerator": "rev.SUM", "denominator": "cust.DISTINCTCOUNT", "format": "#,##0" }
  ],
  "timeApplyTo": ["rev.SUM", "rev_per_cust"],   // measure nền cần LY/LQ/LM/LD + Delta + %Delta
                                                // (bỏ trống = mọi SUM và Performance)
  "dimensions": [
    { "id": "region", "label": "Khu vực", "table": "Ban hang", "column": "Khu vực", "isDate": false }
  ],
  "combos": [                                   // ghép Measure–Dimension (phụ lục (h))
    {
      "pattern": "1-1",                         // 1-1 | N-1 | 1-N | N-N (script tự sửa nếu sai)
      "dimensions": ["region"],                 // id trong "dimensions"
      "measures": ["rev.SUM"],                  // "<id>.<PHÉP>" hoặc id performance/derived
      "purpose": "So sánh doanh thu giữa các khu vực",
      "section": "comparison",                  // overview | trend | comparison | composition | distribution | breakdown
      "chart": "clusteredBarChart"              // gợi ý loại biểu đồ
    }
  ]
}
```

## Ghi chú
- **Kỳ so sánh không khai báo ở đây**: script lấy từ lựa chọn của người dùng (YoY/MoM/QoQ/DoD). Khai báo khác sẽ bị bỏ qua.
- Không có cột ngày → không tạo measure thời gian.
- Metric/dimension trỏ tới bảng/cột không có trong dữ liệu sẽ bị **loại** và ghi cảnh báo trong `result.md`.
- Measure Delta/LY… do script đặt tên: `{Measure} Delta LY`, `{Measure} Delta % LM`…
