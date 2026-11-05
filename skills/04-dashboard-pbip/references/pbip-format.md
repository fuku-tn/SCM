# Định dạng Power BI Project (PBIP) mà script dựng

> Nguồn: tài liệu Microsoft Learn (Power BI Desktop projects) và kho schema công bố `microsoft/json-schemas`. Đây là tài liệu tham khảo cho người bảo trì SKILL; model không cần viết các file này.

## Cây thư mục
```
<Tên>/
├── <Tên>.pbip                       { "$schema": pbip/1.0.0, "version": "1.0", "artifacts": [{"report": {"path": "<Tên>.Report"}}] }
├── <Tên>.Report/
│   ├── definition.pbir              { "version": "4.0", "datasetReference": {"byPath": {"path": "../<Tên>.SemanticModel"}} }
│   ├── definition/                  ← định dạng PBIR (thư mục)
│   │   ├── version.json
│   │   ├── report.json              themeCollection.customTheme + resourcePackages
│   │   └── pages/
│   │       ├── pages.json           pageOrder, activePageName
│   │       └── <pageId>/
│   │           ├── page.json        name, displayName, displayOption, width, height
│   │           └── visuals/<visualId>/visual.json
│   └── StaticResources/RegisteredResources/BIE_Theme.json   (theme 5 màu người dùng chọn)
├── <Tên>.SemanticModel/
│   ├── definition.pbism             { "version": "4.0" }  ← bắt buộc ≥ 4.0 để dùng TMDL
│   └── definition/                  ← định dạng TMDL (thư mục)
│       ├── database.tmdl            database <Tên> / compatibilityLevel: 1600
│       ├── model.tmdl               model Model + ref table … + ref expression DataFolder
│       ├── expressions.tmdl         tham số DataFolder (đường dẫn tới thư mục data)
│       ├── relationships.tmdl
│       └── tables/<Bảng>.tmdl       column, measure, partition (Power Query M đọc CSV)
├── data/*.csv                       dữ liệu đã làm sạch (chặng 3)
└── README.md
```

## Quy tắc TMDL quan trọng (script tuân thủ)
- Thụt lề bằng **tab**; thuộc tính dùng `:`, biểu thức dùng `=`.
- Tên có khoảng trắng / ký tự đặc biệt / không phải ASCII → đặt trong `'…'` (nháy đơn nhân đôi để thoát).
- File ghi **UTF-8 không BOM**, xuống dòng **CRLF** (giống Power BI Desktop).
- Quan hệ: `fromColumn` = phía **nhiều**, `toColumn` = phía **một**; mặc định many-to-one, một chiều.
- Bảng ngày: `dataCategory: Time` + một cột `isKey` kiểu ngày; bảng `Calendar` là bảng tính toán (`partition … = calculated`).

## Quy tắc PBIR quan trọng
- `$schema` của mỗi file xác định phiên bản; Desktop không chấp nhận schema **mới hơn** nó hỗ trợ → mặc định dùng phiên bản ổn định cũ hơn bản mới nhất (xem `pbir-config.json`).
- `definition.pbir` `version` ≥ 4.0 mới cho phép dùng thư mục `definition/` (PBIR).
- Mỗi visual: `name` (≤ 50 ký tự), `position {x,y,z,width,height,tabOrder}`, `visual {visualType, query.queryState.<vai trò>.projections[], objects, visualContainerObjects}`.
- Tên vai trò dữ liệu (`Category`, `Y`, `Values`, `Series`, `Group`, `X`, `Size`…) do từng visual quy định, schema không liệt kê → script dùng vai trò phổ biến của Power BI.

## Giới hạn đã biết
- **Chưa thể kiểm chứng trong Power BI Desktop ở môi trường tự động.** Script chỉ đảm bảo: JSON hợp lệ với schema chính thức (đối chiếu qua `validate_schema.js`), TMDL đúng cú pháp theo tài liệu, tham chiếu nội bộ khớp. TMDL không có schema công bố nên chỉ kiểm tra thụt lề/khai báo gốc.
- Thuộc tính định dạng trong `objects` (vd. `valueAxis.show`) không được schema kiểm tra tên → nếu Desktop bỏ qua một định dạng, chỉnh thủ công.
- Tham số `DataFolder` là đường dẫn tuyệt đối trên máy dựng; nếu chuyển project sang máy khác phải đặt lại (Transform data → Edit parameters).
