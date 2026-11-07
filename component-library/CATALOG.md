# Thư viện thành phần (bóc từ templates của người dùng)

Tự sinh bởi `node scripts/build-components.js` · 54 mẫu (54 PASS, 0 FAIL) · chỉ gồm các loại biểu đồ có thật trong templates.

PASS = kiểm tra cơ học (không còn tham chiếu cũ, gắn thử được, token thay hết). **Chưa phải “đã mở được trong Power BI Desktop”** — việc đó cần mở `gallery` và xác nhận.

## Loại biểu đồ có trong từng template

- **Dashboard HR**: pivotTable×4, card×11, slicer×2, advancedSlicerVisual×3, textSlicer×3, map×2, cardVisual×8, lineChart×5, donutChart×3, lineClusteredColumnComboChart×2, treemap×1, hundredPercentStackedBarChart×1, clusteredBarChart×1
- **Dashboard Sale**: slicer×2, cardVisual×5, donutChart×1, lineChart×1, treemap×1, shapeMap×1, lineClusteredColumnComboChart×1, pivotTable×1

## Danh sách mẫu

| Loại | Mẫu | Template · Trang | Kích thước | Vai trò (trường cần gắn) | Trạng thái |
|---|---|---|---|---|---|
| advancedSlicerVisual | `hr-p2-advancedSlicerVisual-6496ed` | hr · 2. Overview | 348×98 | Values: hierarchy | ✅ |
| advancedSlicerVisual | `hr-p3-advancedSlicerVisual-31aa14` | hr · 3. Department | 240×480 | Values: column | ✅ |
| advancedSlicerVisual | `hr-p4-advancedSlicerVisual-4917b4` | hr · 4. Geography | 681×70 | Values: column | ✅ |
| card | `hr-p2-card-163dc6` | hr · 2. Overview | 1005×80 | Values: measure | ✅ |
| card | `hr-p4-card-944cad` | hr · 4. Geography | 756×80 | Values: measure | ✅ |
| card | `hr-p4-card-d8b950` | hr · 4. Geography | 260×126 | Values: measure | ✅ |
| card | `hr-p4-card-2c6190` | hr · 4. Geography | 218×126 | Values: measure | ✅ |
| card | `hr-p4-card-269a7a` | hr · 4. Geography | 218×126 | Values: measure | ✅ |
| card | `hr-p4-card-e8b786` (+2 bản giống) | hr · 4. Geography | 56×62 | Values: measure | ✅ |
| card | `hr-p4-card-df6be0` (+1 bản giống) | hr · 4. Geography | 78×57 | Values: measure | ✅ |
| card | `hr-p4-card-2ee99c` | hr · 4. Geography | 79×58 | Values: measure; Extra: measure | ✅ |
| cardVisual | `hr-p2-cardVisual-96f917` | hr · 2. Overview | 358×200 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p2-cardVisual-b14a89` | hr · 2. Overview | 358×200 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p2-cardVisual-46cbbb` | hr · 2. Overview | 358×200 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p2-cardVisual-8940fd` | hr · 2. Overview | 358×198 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p3-cardVisual-16a5f3` | hr · 3. Department | 250×170 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p3-cardVisual-e0f26e` | hr · 3. Department | 250×170 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p3-cardVisual-fc981d` | hr · 3. Department | 250×170 | Data: measure; Extra: measure | ✅ |
| cardVisual | `hr-p3-cardVisual-d4fa71` | hr · 3. Department | 250×170 | Data: measure; Extra: measure | ✅ |
| cardVisual | `sale-p2-cardVisual-56ba69` | sale · 2. Overview | 271×177 | Data: measure; Extra: measure | ✅ |
| cardVisual | `sale-p2-cardVisual-78ef75` | sale · 2. Overview | 271×177 | Data: measure; Extra: measure | ✅ |
| cardVisual | `sale-p2-cardVisual-cca477` | sale · 2. Overview | 271×177 | Data: measure; Extra: measure | ✅ |
| cardVisual | `sale-p2-cardVisual-f0246a` | sale · 2. Overview | 271×177 | Data: measure; Extra: measure | ✅ |
| cardVisual | `sale-p2-cardVisual-d8a81b` | sale · 2. Overview | 271×177 | Data: measure; Extra: measure | ✅ |
| clusteredBarChart | `hr-p4-clusteredBarChart-1097e9` | hr · 4. Geography | 658×516 | Category: column; Y: measure | ✅ |
| donutChart | `hr-p2-donutChart-4231c4` | hr · 2. Overview | 595×703 | Category: column; Y: measure | ✅ |
| donutChart | `hr-p3-donutChart-2b872f` | hr · 3. Department | 297×337 | Category: column; Y: column:Count | ✅ |
| donutChart | `hr-p4-donutChart-dc8b0f` | hr · 4. Geography | 498×370 | Category: column; Y: measure | ✅ |
| donutChart | `sale-p2-donutChart-78243b` | sale · 2. Overview | 357×333 | Category: column; Y: measure | ✅ |
| hundredPercentStackedBarChart | `hr-p3-hundredPercentStackedBarChart-b2ac6d` | hr · 3. Department | 607×425 | Category: column; Series: column; Y: measure | ✅ |
| lineChart | `hr-p2-lineChart-3afdd4` | hr · 2. Overview | 320×236 | Category: hierarchy; Y: measure | ✅ |
| lineChart | `hr-p2-lineChart-7d038a` (+2 bản giống) | hr · 2. Overview | 320×236 | Category: hierarchy; Y: measure | ✅ |
| lineChart | `hr-p2-lineChart-ff7871` | hr · 2. Overview | 1430×610 | Category: column; Y: measure; Y2: measure | ✅ |
| lineChart | `sale-p2-lineChart-e9ae97` | sale · 2. Overview | 740×330 | Category: column; Y: measure; Y2: measure | ✅ |
| lineClusteredColumnComboChart | `hr-p2-lineClusteredColumnComboChart-0ee36e` | hr · 2. Overview | 1430×585 | Category: column; Y: measure; Y2: measure | ✅ |
| lineClusteredColumnComboChart | `hr-p3-lineClusteredColumnComboChart-2ec6d6` | hr · 3. Department | 745×338 | Category: column; Y: measure; Y2: measure | ✅ |
| lineClusteredColumnComboChart | `sale-p2-lineClusteredColumnComboChart-46ae5c` | sale · 2. Overview | 835×380 | Category: column; Y: measure; Y2: measure | ✅ |
| map | `hr-p2-map-e3408a` | hr · 2. Overview | 731×505 | Category: column; Size: column:Count | ✅ |
| map | `hr-p4-map-f9387e` | hr · 4. Geography | 486×478 | Category: column; Size: column:Count | ✅ |
| pivotTable | `hr-p2-pivotTable-783644` | hr · 2. Overview | 793×705 | Rows: column, column; Values: measure, measure | ✅ |
| pivotTable | `hr-p2-pivotTable-6db352` | hr · 2. Overview | 693×565 | Rows: column; Values: column:Count, measure, measure, measure | ✅ |
| pivotTable | `hr-p3-pivotTable-bbf3f1` | hr · 3. Department | 810×425 | Rows: column, column; Values: column:Count, measure, measure | ✅ |
| pivotTable | `hr-p4-pivotTable-75a1dc` | hr · 4. Geography | 848×516 | Rows: column; Values: measure, measure, measure, measure; Extra: column:Min, column:Max | ✅ |
| pivotTable | `sale-p2-pivotTable-eea44e` | sale · 2. Overview | 810×393 | Rows: column; Values: measure, measure, measure, measure | ✅ |
| shapeMap | `sale-p2-shapeMap-f9a724` | sale · 2. Overview | 328×422 | Category: column; Tooltips: measure | ✅ |
| slicer | `hr-p2-slicer-d4be43` | hr · 2. Overview | 240×98 | Values: hierarchy | ✅ |
| slicer | `hr-p2-slicer-a70514` | hr · 2. Overview | 214×184 | Values: column | ✅ |
| slicer | `sale-p2-slicer-5317c4` | sale · 2. Overview | 133×62 | Values: column | ✅ |
| slicer | `sale-p2-slicer-4750a9` | sale · 2. Overview | 144×62 | Values: column | ✅ |
| textSlicer | `hr-p2-textSlicer-4c4a49` | hr · 2. Overview | 558×98 | Values: column | ✅ |
| textSlicer | `hr-p3-textSlicer-8b8253` | hr · 3. Department | 241×66 | Values: column | ✅ |
| textSlicer | `hr-p4-textSlicer-a0d72f` | hr · 4. Geography | 383×67 | Values: column | ✅ |
| treemap | `hr-p3-treemap-528242` | hr · 3. Department | 357×503 | Group: column; Values: measure | ✅ |
| treemap | `sale-p2-treemap-65c4cd` | sale · 2. Overview | 454×297 | Group: column; Values: measure | ✅ |
