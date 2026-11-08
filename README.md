# BIE — Business Intelligence Engine

Ứng dụng web chạy cục bộ (Node.js, `http://localhost:6688`) biến **một file CSV/Excel** thành **project Power BI (PBIP)** qua 4 chặng, mỗi chặng là một **SKILL**:

```
Business Context  →  Key Metrics  →  Data (ETL)  →  Dashboard (PBIP)
```

Model (Claude, qua `claude` CLI) lo phần suy luận; **script xác định** lo phần phải chính xác: làm sạch dữ liệu, sinh DAX, dựng PBIP, kiểm tra cấu trúc. Giao diện tiếng Việt, thuật ngữ chuyên ngành giữ tiếng Anh.

## Yêu cầu

- **Node.js ≥ 18** (đã thử trên Node 24)
- **Claude Code CLI** (`claude`) đã cài và đăng nhập — server gọi `claude -p` để chạy model
- **Power BI Desktop** (để mở kết quả `.pbip`); bật *Power BI Project (.pbip)* và *PBIR* trong *Options → Preview features* nếu bản của bạn còn yêu cầu
- Windows / macOS / Linux (script `SetDataFolder.ps1` cần PowerShell)

## Cài đặt và chạy

```bash
npm install
npm start            # http://localhost:6688
npm test             # chạy bộ test (node --test)
```

Biến môi trường:

| Biến | Tác dụng |
|---|---|
| `PORT` | Đổi cổng (mặc định 6688) |
| `BIE_MOCK=1` | Chế độ giả lập: không gọi model thật (để thử giao diện/luồng) |
| `BIE_SKIP_SCHEMA=1` | Bỏ qua bước tải schema Microsoft khi kiểm tra PBIP (chạy offline / test) |
| `BIE_MOCK_FAIL=N` | (chỉ để thử, cùng `BIE_MOCK=1`) N lần Evaluator đầu tiên sẽ chấm trượt |

## Cách dùng

1. Mở trang **Analysis** và đi qua 4 bước (có thể làm **theo thứ tự bất kỳ**):
   1. *Business Context* — ngữ cảnh doanh nghiệp và yêu cầu phân tích (gõ hoặc nạp file `.md/.pdf/.docx`). Có nút **tải file mẫu Word** (`.docx`, 2 phần: Ngữ cảnh / Yêu cầu); nạp file mẫu vào ô nào BIE cũng tự tách đúng phần.
   2. *Key Metrics* — khai báo **người xem trực tiếp (Direct, bắt buộc)**: phòng ban, vị trí, level, **giới tính, học vấn**, thâm niên; và **người xem gián tiếp (Indirect, không bắt buộc, có thể nhiều người)**. Mỗi nhóm có **file mẫu `.docx` tải về điền** (Direct: ghi chú về người đọc + các dòng "Nhãn: giá trị"; Indirect: bảng nhiều người) — tải file lên thì form được điền sẵn / tự tạo thẻ cho từng người, phần ghi chú tự do được đưa vào prompt. Sau đó chọn chỉ số / kỳ so sánh (YoY, MoM, QoQ, DoD) / dimension (có nút gợi ý).
   3. *Data (ETL)* — xem tình trạng dữ liệu; làm sạch chạy khi bạn bấm chạy.
   4. *Dashboard* — chọn **template mẫu** (trong `templates/`) **hoặc tải template `.pbix` của bạn** (PBIR, < 100MB); ngôn ngữ dashboard; **xem trước & duyệt bố cục** (xem bên dưới); giữ màu template hoặc dùng 5 màu của bạn.
2. Chọn model cho từng chặng, rồi **Chạy chặng này** hoặc **Chạy tất cả 4 chặng**. Nếu thiếu thông tin cho chặng đang chạy, một bảng cảnh báo cho phép *Vẫn chạy* hoặc *Quay lại bổ sung*.
3. Xem kết quả ở trang **Results** (mỗi chặng có `result.md`, file phụ, nút tải `.zip`). Trang **Home** hiển thị luồng 4 chặng: đang chạy, xong, lỗi (bấm vào để xem chi tiết lỗi).
4. Giải nén project PBIP, mở file `.pbip`.

### Bố cục dashboard: xem trước, góp ý, duyệt (mục 4.3)

Trước khi chạy chặng 4, bấm **Đề xuất bố cục**: AI (có quy tắc kiểm tra bằng code) đề xuất **số trang và biểu đồ từng trang** theo câu chuyện *tổng quan → xu hướng → so sánh/phân rã → chi tiết*, bám các trang của template.

- Template quyết định **số ô biểu đồ, vị trí và loại** của mỗi trang. Template chỉ 1 trang mà cần nhiều trang → **nhân bản trang** (mỗi bản giữ đúng số biểu đồ của trang gốc).
- Màn hình review hiển thị sơ đồ từng trang + bảng biểu đồ: đổi loại (trong cùng họ: cột/thanh/đường/vùng, pie/donut), sửa tiêu đề, đặt **Top N**, bỏ ô, ghi **góp ý cho từng biểu đồ** hoặc góp ý chung rồi **Cập nhật theo góp ý** để AI sửa. Khi hài lòng bấm **Duyệt**.
- **Giới hạn số giá trị hiển thị**: nếu chiều có quá nhiều giá trị (vd. 42 sản phẩm trên cột/thanh ≤ 12–15, donut ≤ 5) → tự đề xuất Top N (hoặc đổi chiều ít giá trị cho donut). Top N làm bằng measure xếp hạng (DAX do script sinh), tiêu đề nên ghi "Top N".
- Bản đã duyệt lưu ở `00-input/dashboard-plan.json` và được đưa vào prompt chặng 4 như **hợp đồng** (số trang, ô, loại, Top N, tiêu đề); Evaluator có tiêu chí kiểm tra tuân thủ. Đổi chỉ số/chiều/template/ngôn ngữ sau khi duyệt → bố cục báo "không còn khớp".
- Template của riêng bạn: file `.pbix` phải lưu ở **PBIR** (Options → Preview features → *Store reports using enhanced metadata format (PBIR)*); file hỏng/sai định dạng bị từ chối kèm hướng dẫn.

### Cài đặt trên máy khác & tự cập nhật

**Cài một dòng lệnh** (Windows PowerShell; cần Git, Node.js 18+, và Claude Code CLI `claude` để chạy model thật):
```powershell
irm https://raw.githubusercontent.com/fuku-tn/BIE/main/install.ps1 | iex
```
Repo riêng tư: dùng token **chỉ có quyền đọc** repo này (GitHub → Settings → Developer settings → Fine-grained tokens → Repository access = repo BIE, Permissions → Contents = Read-only, đặt hạn ngắn):
```powershell
powershell -c "$env:KIT_TOKEN='<TOKEN>'; $h=@{Authorization=""Bearer $env:KIT_TOKEN""}; irm -Headers $h https://raw.githubusercontent.com/fuku-tn/BIE/main/install.ps1 | iex"
```
Token được lưu ở `.bie-token` (đã gitignore) chỉ để chức năng cập nhật dùng lại; không ghi vào URL hay `.git/config`.

**Thông báo phiên bản mới:** BIE định kỳ (mỗi ~20 phút và khi mở) so sánh với `origin/main` trên GitHub. Có commit mới → nút **⬆ Có bản mới** ở thanh trên + cửa sổ liệt kê thay đổi. Bấm **Cập nhật ngay** → server mở một cửa sổ terminal chạy `update.ps1`: dừng server → `git pull --ff-only` → `npm install` (chỉ khi thư viện đổi) → chạy lại BIE và mở trình duyệt. Dữ liệu/kết quả trong `output/` được giữ nguyên.
- Không cập nhật khi đang có flow chạy; nếu bạn đã sửa file đã theo dõi trong thư mục BIE thì dừng lại và báo (không ghi đè).
- Cần bản **clone git** (không phải tải .zip). Tự mở terminal hiện hỗ trợ Windows; hệ khác hiển thị lệnh để chạy tay.
- Người phát hành chỉ cần **push lên `main`** — máy khác sẽ nhận thông báo.

### Cổng Version (Budget / Target / Forecast…)

Nếu ở Key Metrics bạn chọn so sánh với **Version**, flow có một nhánh kiểm tra riêng:
`Data (ETL) → [Version check] → quay lại Key Metrics → Dashboard → Output` (đường nối vàng quay ngược trên workflow).
- Sau Data (ETL), BIE tìm dữ liệu Version trong dữ liệu đã làm sạch (cột như `Revenue Budget`, `Forecast`…). **Đủ** → chạy tiếp.
- **Thiếu** → flow **tạm dừng** (trạng thái "Chờ dữ liệu Version", chuông thông báo báo ngay) và hiện cửa sổ: tải **file mẫu .xlsx** (đã điền sẵn tên chỉ số + Version bạn chọn) → điền → tải lên. File được kiểm tra (thiếu cột, chưa điền số, Version còn thiếu…).
- Có dữ liệu → script sinh measure Version (`<Chỉ số> <Version>`, `… vs <Version>`, `… vs <Version> %`; DAX do script viết, bảng `Versions` nối Calendar) rồi chạy tiếp Dashboard + Output.
- Không có dữ liệu → bấm "Tiếp tục không có dữ liệu": hiện cảnh báo **số liệu so sánh Version sẽ không có / không chính xác**; chặng Dashboard được dặn không tạo so sánh Version và kết quả có cảnh báo.
- Số Version được so với thực tế **theo thời gian** (Calendar), chưa theo chiều khác (vùng, sản phẩm…).

### Lần đầu mở PBIP: bấm Refresh

Project PBIP **không lưu sẵn dữ liệu đã nạp**, nên lần đầu mở báo cáo sẽ **trống số liệu** — bấm **Home → Refresh (Làm mới)** một lần là có số. Nếu Refresh báo không thấy file (đã chuyển project sang máy/thư mục khác), chạy trong thư mục project:

```powershell
powershell -ExecutionPolicy Bypass -File .\SetDataFolder.ps1
```

Script đặt lại tham số `DataFolder` về thư mục `data` cạnh file `.pbip`.

## Tùy chọn: Kiểm chứng độc lập & tự sửa (Evaluator)

Bật ở thanh chạy (`Kiểm chứng độc lập & tự sửa`). Sau mỗi chặng, **một lượt model riêng, chỉ đọc** chấm kết quả theo danh sách tiêu chí nghiệm thu (AC) trong `skills/<chặng>/assets/evaluator.md`:

- Trượt AC **critical** → chặng tự chạy lại, kèm phản hồi cụ thể, **tối đa 2 lần** (tổng 3 lần). Lỗi script cũng được chạy lại.
- Hết lượt vẫn trượt → chặng báo lỗi (kết quả vẫn nằm trên đĩa để xem); chi tiết ở `evaluation.md`.
- Evaluator lỗi/không trả JSON hợp lệ → **không chặn** chặng. Verdict cuối cùng do code tính từ từng AC, không tin trường `verdict` của model.
- Tốn thêm token (tính vào tổng của phiên). Mặc định tắt.

## Cách BIE giữ chất lượng

| Cơ chế | Mô tả |
|---|---|
| **EDA tất định** (`lib/eda.js`) | Tính trên dữ liệu đã làm sạch: phân phối, ngoại lệ, xu hướng/MoM/YoY, mùa vụ, cơ cấu theo nhóm, tập trung, tương quan, chất lượng. Mỗi phát hiện có mã `F#`, chèn vào prompt chặng 1, 2, 4; Business Context phải trích `F#` làm bằng chứng và `post.js` kiểm tra mã có thật. |
| **Hồ sơ người xem** (`lib/audience.js`) | Từ level + thâm niên, **code** tính nhóm người xem, số KPI/trang, số trang, mức chi tiết; chèn vào prompt và cảnh báo ở chặng 4 nếu dashboard lệch. |
| **Knowledge base** (`knowledge-base/rulesets/`) | Ruleset chọn KPI, thủ pháp DAX, thiết kế mô hình, chọn biểu đồ. SKILL khai báo `knowledge: a, b` trong frontmatter để nạp. |
| **Validator PBIP** (`validate_build.js`) | Kiểm tra cơ học bản build: JSON/BOM, TMDL, đường dẫn, tham chiếu cột/measure có tồn tại, quan hệ, 4–6 thẻ KPI/trang… Lỗi cứng làm chặng 4 báo lỗi. |
| **Evaluator** | Xem phần trên. |

## Cấu trúc thư mục

```
server.js                 Express: API, ghép prompt, chạy CLI/script, orchestration
public/                   Giao diện (home.js, analysis.js, app.js, styles.css)
lib/
  pbix-template.js        Đọc .pbix mẫu, sinh manifest cho prompt, áp template khi dựng PBIP
  eda.js                  EDA tất định → danh sách phát hiện F#
  audience.js             Hồ sơ người xem tính bằng code
  evaluator.js            AC, gom bằng chứng, dựng prompt, phân tích verdict
skills/<NN-chặng>/
  SKILL.md                Hướng dẫn cho model (frontmatter: name, title, description, handoff?, knowledge?, tools?)
  references/             Tài liệu tham chiếu (tiêu chuẩn, schema, mẫu công thức)
  assets/                 Khung output, ví dụ, evaluator.md (AC)
  scripts/                pre.js (chạy TRƯỚC model) / post.js (chạy SAU model)
knowledge-base/rulesets/  Ruleset tri thức nạp theo SKILL
templates/                Template Power BI (.pbix) để người dùng chọn ở chặng Dashboard
documents/                Tài liệu yêu cầu gốc (Analysis - layout, SKILL - Custom, IBCS - Standard)
tests/                    Test (node --test)
output/<run-id>/          Kết quả mỗi phiên (không commit)
CLAUDE.md                 Quy định nạp vào mọi chặng (sửa được ở trang "Bộ nhớ")
MEMORY.md                 Bộ nhớ tích lũy qua các lần chạy
```

Kết quả một phiên:

```
output/<run-id>/
  00-input/      dữ liệu, ngữ cảnh, yêu cầu, profile.json, eda/ (eda.md, eda.json)
  01-business-goal/   result.md, business-goal.md, business-goal-check.md
  02-key-metrics/     result.md, metrics-spec.json, measures.json, measures.dax
  03-data-etl/        result.md, clean/*.csv, data-checks.json, model-spec.json
  04-dashboard-pbip/  result.md, dashboard-spec.json, pbip-validation.md, pbip/<Tên>/
  (mỗi chặng có thể có) prompt.md, metrics.json, pre.log, post.log, evaluation.md/json
```

### Giao thức giữa các chặng

- Kết quả chính mỗi chặng là `result.md`. File phụ được model xuất bằng khối `<<<FILE: ten-file.json>>> … <<<END FILE>>>`; server tách thành file thật (đuôi `.json .md .dax .csv .txt .tmdl .m .sql`).
- File nêu trong `handoff:` của SKILL được tự nạp vào prompt các chặng sau.
- Tên cột/bảng/measure/dimension phải **giữ nguyên từng ký tự** xuyên suốt các chặng.
- **Công thức DAX do script sinh** từ `metrics-spec.json`; model không tự gõ DAX rời rạc.

## Quản lý SKILL

Trang **Skills** cho sửa `SKILL.md` ngay trên web và **kéo thả** để thay SKILL của một chặng: file `.zip`/`.skill`, một thư mục skill (có `SKILL.md`), hoặc trực tiếp `SKILL.md`. Bản cũ được sao lưu trong `skills/_backup/`.

## Template Power BI

Đặt file `.pbix` (định dạng PBIR) vào `templates/` (kể cả trong thư mục con). Khi người dùng chọn một template, chặng 4 giữ nguyên giao diện (nền, hình, logo, nút chuyển trang, màu, định dạng biểu đồ) và **gắn lại dữ liệu của người dùng** vào các biểu đồ; phần không phù hợp bị loại. Luôn tuân theo quy tắc **mỗi trang chỉ 4–6 thẻ KPI** (tối đa 6) dù template gốc có nhiều hơn. Chi tiết xem [templates/README.md](templates/README.md).

## Thư viện thành phần (component library)

`component-library/` chứa các biểu đồ **bóc từ chính template của bạn** (chỉ những loại biểu đồ có thật trong template, không thêm loại khác): mỗi mẫu là một `visual.json` đã gỡ ràng buộc dữ liệu cũ, thay bằng "vai trò" (Category, Y, Values…) để gắn lại vào cột/measure của người dùng.

```bash
node scripts/build-components.js                     # bóc lại thư viện từ templates/ → component-library/ (CATALOG.md liệt kê mẫu)
node scripts/build-gallery.js <project-pbip> [out]   # gắn mọi mẫu vào dữ liệu thật, xếp 6 mẫu/trang để mở thử trong Desktop
```

“PASS” trong `CATALOG.md` chỉ là kiểm tra cơ học; mẫu chỉ được coi là đã kiểm chứng khi mở được trong Power BI Desktop.

## Script và test

```bash
node skills/04-dashboard-pbip/scripts/validate_build.js <thư-mục-project-pbip>   # exit 1 nếu có lỗi cứng
node skills/04-dashboard-pbip/scripts/validate_schema.js <thư-mục-project-pbip>  # kiểm tra schema Microsoft (cần mạng)
npm test
```

Bộ test (`tests/`) gồm: làm sạch dữ liệu (CSV `;`, số kiểu `1.234,56`, ngày `dd/mm/yyyy`, tiêu đề gộp, PK/FK lệch định dạng, bảng rộng, tiêu đề tiếng Việt), sinh DAX, dựng PBIP ở ba chế độ (không template / `sale` / `hr`), validator, EDA, hồ sơ người xem, Evaluator. Test chạy offline, không gọi model.

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Mở PBIP thấy trống số liệu | Bình thường — bấm **Refresh** một lần |
| Refresh báo không tìm thấy file | Chạy `SetDataFolder.ps1`, hoặc *Transform data → Edit parameters* → đặt `DataFolder` |
| Chặng báo lỗi script | Mở chi tiết lỗi ở trang Home; xem `pre.log` / `post.log` trong thư mục chặng |
| "Phiên này đang chạy một chặng" (409) | Đợi chặng đang chạy xong rồi chạy tiếp |
| `Không chạy được claude CLI` | Cài và đăng nhập Claude Code CLI; kiểm tra lệnh `claude` chạy được trong terminal |
| Số liệu lệch sau làm sạch | Xem `03-data-etl/data-checks.json` và mục "Hành động đã thực hiện" trong `result.md` |
| Cổng 6688 bị chiếm | `PORT=6689 npm start` |

## Giới hạn hiện tại

- Dữ liệu nhập: một file CSV/Excel mỗi phiên (nhiều sheet = nhiều bảng). Chưa kết nối trực tiếp CSDL.
- PBIP dùng chế độ **Import** với dữ liệu CSV đã làm sạch (đường dẫn tuyệt đối qua tham số `DataFolder`).
- EDA phân tích từng bảng riêng, chưa nối các bảng để phân tích chéo.
- Evaluator là một model khác chấm — giảm sai sót nhưng không thay thế việc người dùng xem lại số liệu quan trọng.
- Mô hình chỉ biết những gì có trong dữ liệu và thông tin bạn nhập; thiếu thì kết quả ghi `[Giả định]` / `[Thiếu thông tin]` thay vì bịa.
