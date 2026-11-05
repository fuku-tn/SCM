# Tiêu chuẩn trực quan hóa dữ liệu IBCS® (nguồn: documents/IBCS - Standard.docx)

> Tài liệu này là bản chuyển sang Markdown của file Word do người dùng cung cấp. Đây là CHUẨN BẮT BUỘC khi thiết kế Dashboard ở chặng Dashboard (PBIP).
> Hình minh họa Trước/Sau từng loại biểu đồ nằm trong `assets/ibcs/` (đánh số theo thứ tự xuất hiện trong tài liệu).

HƯỚNG DẪN THIẾT KẾ DATA VISUALIZATION THEO TIÊU CHUẨN IBCS®

Tài Liệu Hướng Dẫn Soạn Giảng Dành Cho Giảng Viên & Học Viên (Tiêu Chuẩn Quốc Tế ISO 24896:2026)

📌 BẢN CHẤT CỦA TIÊU CHUẨN IBCS® (NOTATIONAL SEMANTICS):Tất cả các nội dung có cùng ý nghĩa bản chất thì phải được trình bày hoàn toàn giống nhau; những nội dung khác ý nghĩa bản chất tuyệt đối không trình bày giống nhau. IBCS giúp nhà quản trị ra quyết định nhanh hơn 30%–50% nhờ cơ chế nhận diện mẫu hình thị giác (Pattern Recognition) và triệt tiêu tối đa rác thị giác (Chartjunk).

## PHẦN 1: QUY TẮC THIẾT KẾ VÀ ĐỊNH DẠNG CÁC LOẠI BIỂU ĐỒ (CHART TYPES)

Việc lựa chọn đúng loại biểu đồ phụ thuộc hoàn toàn vào bản chất của chuỗi dữ liệu (Thời gian vs Phi thời gian, Cấu trúc vs Biến động). Phần này trình bày quy chuẩn định dạng cho toàn bộ các loại biểu đồ thường dùng trong báo cáo quản trị: cột, thanh, xếp chồng, đường, vùng, kết hợp, thác nước, phễu, phân tán, bong bóng, tròn, treemap, đồng hồ đo, bảng số liệu và lưới biểu đồ nhỏ. Mỗi mục có một hình minh họa gồm hai nửa cùng một bộ dữ liệu: bên trái (Trước) là biểu đồ với thiết lập mặc định, bên phải (Sau) là biểu đồ đã định dạng theo chuẩn IBCS®.

Ghi chú về hình minh họa: toàn bộ hình được biên soạn riêng cho tài liệu này từ dữ liệu giả lập (đơn vị triệu USD), nhằm bảo đảm hai nửa Trước/Sau luôn so sánh được trực tiếp với nhau.

### 1.0. Quy Ước Chung Cho Mọi Loại Biểu Đồ

- Hướng của trục: Chuỗi thời gian luôn nằm trên trục ngang, chạy từ trái sang phải (quá khứ ở bên trái). Phân tích cấu trúc theo danh mục phi thời gian đặt trên trục dọc.
- Loại bỏ rác thị giác: Tắt đường lưới Gridlines, hiệu ứng 3D, bóng đổ, đổ màu chuyển sắc (gradient), viền khung bao quanh biểu đồ và màu nền trang trí. Mọi đường phân cách, đường bao hoặc đường nền (baseline) không dày quá 1px.
- Nhãn trực tiếp: Gắn giá trị và tên chuỗi/phân đoạn ngay trên đối tượng thay cho trục số và chú giải. Chỉ dùng chú giải khi nó thực sự bổ sung thông tin mà nhãn trực tiếp không thể hiện được.
- Đồ họa theo kịch bản: Thực tế (Actual - AC): khối đặc màu xám đậm. Kế hoạch (Plan - PL): khung viền rỗng nền trắng. Dự báo (Forecast - FC): họa tiết gạch chéo 45 độ. Năm trước (Previous Year - PY): xám nhạt. Cùng một kịch bản phải có cùng một kiểu tô ở mọi biểu đồ trong báo cáo.
- Màu sắc: Xanh lá (#38A169) chỉ dành cho độ lệch Thuận lợi, Đỏ (#E53E3E) chỉ dành cho độ lệch Bất lợi (đảo ngược logic với chỉ số Chi phí/Rủi ro). Các phân đoạn, danh mục còn lại dùng thang xám từ đậm đến nhạt; chỉ nhấn mạnh bằng màu đậm cho đối tượng cần chú ý.
- Định dạng số: Số âm dùng dấu trừ; dấu cộng chỉ xuất hiện ở độ lệch. Dùng khoảng trắng làm dấu phân tách hàng nghìn, ghi rõ đơn vị tính ở phụ đề của biểu đồ thay vì lặp lại ở từng nhãn.
- Thang đo đồng nhất: Các biểu đồ cùng đơn vị đặt cạnh nhau phải dùng chung một thang đo để so sánh trực tiếp bằng mắt.

### 1.1. Biểu đồ Cột (Column Chart - Dành Cho Chuỗi Thời Gian)

- Phạm vi áp dụng: Chỉ sử dụng biểu đồ Cột thẳng đứng cho chuỗi dữ liệu theo thời gian (Time Series) được biểu diễn trên trục ngang (X-axis) từ trái sang phải.
- TẮT HOÀN TOÀN TRỤC Y (No Y-Axis Rule): Tuyệt đối không hiển thị trục Y (xóa cả đường trục Y và dãy số liệu trên trục Y) để loại bỏ rác thị giác. Thay vào đó, bắt buộc sử dụng nhãn giá trị trực tiếp (Direct Data Labels) đặt ở vị trí đỉnh từng cột. Màu sắc của data labels trùng với màu cột nếu vị trí là outside end. Nếu vị trí data labels là inside base hoặc inside end thì màu đen hoặc trắng tuỳ theo màu cột.
- Khoảng cách và độ rộng cột: Độ rộng khoảng trống giữa các cột (Gap width) duy trì từ 20% đến 50% độ rộng của cột. Phân biệt cấp độ thời gian qua độ rộng cột (Năm rộng hơn Quý, Quý rộng hơn Tháng).
- Gốc trục Y bằng 0 (Zero Baseline): Đường baseline luôn cố định tại giá trị 0 và được vẽ nét đậm mỏng chuẩn (1px) để đảm bảo không bóp méo tỷ lệ thị giác.
- Phân biệt kỳ thực tế và kỳ dự báo: Các kỳ đã phát sinh dùng cột đặc xám đậm (AC), các kỳ chưa phát sinh dùng cột gạch chéo (FC); khoá chú thích kịch bản nhỏ đặt ở góc trên biểu đồ.

> 🖼 Hình minh họa #1: assets/ibcs/figure-01.png

_Hình 1.1: Biểu đồ Cột chuẩn IBCS® — Tắt hoàn toàn Trục Y, nhãn giá trị trực tiếp trên đỉnh cột, phân biệt AC và FC_

### 1.3. Biểu đồ Thanh Ngang (Horizontal Bar Chart - Dành Cho Danh Mục Phi Thời Gian)

- Phạm vi áp dụng: Sử dụng biểu đồ Thanh nằm ngang khi so sánh cấu trúc giữa các danh mục phi thời gian (Sản phẩm, Chi nhánh, Khu vực, Khách hàng) trên trục dọc (Y-axis).
- Nguyên tắc Tắt Trục X & Trục Y: Tắt hoàn toàn chia độ trục X bên dưới và đường trục Y. Nhãn tên danh mục căn trái nằm bên trái thanh; nhãn giá trị căn phải nằm ngay bên phải đầu thanh.
- Quy tắc Sắp xếp Giảm dần: Bắt buộc sắp xếp các thanh theo thứ tự giá trị giảm dần từ trên xuống dưới (trừ trường hợp danh mục có thứ tự tự nhiên quy định trước) để giúp mắt người đọc nhận biết ngay danh mục lớn nhất.
- Chiều cao thanh: Khoảng cách giữa các thanh nhỏ hơn chiều cao thanh; tất cả thanh trong cùng biểu đồ có cùng chiều cao.

Màu sắc của data labels trùng với màu cột nếu vị trí là outside end. Nếu vị trí data labels là inside base hoặc inside end thì màu đen hoặc trắng tuỳ theo màu cột.

> 🖼 Hình minh họa #2: assets/ibcs/figure-02.png

_Hình 1.3: Biểu đồ Thanh Ngang chuẩn IBCS® — Sắp xếp giảm dần, nhãn danh mục đọc ngang dễ dàng_

### 1.5. Biểu đồ Cột Xếp Chồng (Stacked Column Chart - Cấu Trúc Theo Thời Gian)

- Giới hạn phân đoạn (Max 3-4 Segments): Không chia nhỏ một cột thành quá 4 phân đoạn. Việc chia quá nhiều phân đoạn khiến người xem không thể so sánh được các đoạn nằm ở vị trí lơ lửng bên trên. Gộp các nhóm nhỏ thành phân đoạn "Khác".
- Thứ tự phân đoạn nhất quán: Sắp xếp phân đoạn lớn nhất hoặc quan trọng nhất nằm ở gốc dưới cùng và duy trì thứ tự này trên toàn bộ báo cáo.
- Điều kiện sử dụng: Chỉ xếp chồng khi toàn bộ giá trị cùng dấu (cùng dương hoặc cùng âm).
- Màu sắc: Dùng thang xám từ đậm (đoạn ở gốc) đến nhạt (đoạn trên cùng); nhãn chữ trắng trên nền đậm, chữ đen trên nền nhạt; ngăn cách các đoạn bằng đường viền trắng mảnh. Dành màu xanh/đỏ cho độ lệch.
- Nhãn trực tiếp: Ghi giá trị trong từng đoạn đủ rộng, tổng ở đỉnh cột in đậm; tên phân đoạn gắn trực tiếp ở mép phải cột cuối cùng thay cho chú giải. Tắt trục Y.

> 🖼 Hình minh họa #3: assets/ibcs/figure-03.png

_Hình 1.5: Biểu đồ Cột Xếp Chồng chuẩn IBCS® — Tối đa 4 phân đoạn, tổng ở đỉnh, tên phân đoạn gắn trực tiếp_

### 1.6. Biểu đồ Thanh Xếp Chồng (Stacked Bar Chart - Cấu Trúc Theo Danh Mục)

- Phạm vi áp dụng: Phân tích cấu trúc của từng danh mục phi thời gian thành các phần cấu thành (ví dụ cơ cấu nhóm hàng theo vùng).
- Sắp xếp: Sắp xếp các thanh theo tổng giảm dần từ trên xuống; thứ tự phân đoạn cố định từ sát lề trái và nhất quán trên toàn bộ báo cáo.
- Giới hạn phân đoạn: Tối đa 4 phân đoạn mỗi thanh, nhóm phần còn lại vào "Khác"; chỉ xếp chồng khi mọi giá trị cùng dấu.
- Nhãn: Giá trị từng đoạn nằm trong đoạn, tổng in đậm ở cuối thanh; tên phân đoạn viết một lần phía trên thanh đầu tiên. Tắt trục X và lưới.

> 🖼 Hình minh họa #4: assets/ibcs/figure-04.png

_Hình 1.6: Biểu đồ Thanh Xếp Chồng chuẩn IBCS® — Sắp theo tổng giảm dần, thứ tự phân đoạn cố định_

### 1.7. Biểu đồ Cột Xếp Chồng 100% (100% Stacked Column Chart - Cơ Cấu Tương Đối Theo Thời Gian)

- Phạm vi áp dụng: Khi điều cần nhấn mạnh là tỷ trọng tương đối giữa các thành phần qua từng kỳ chứ không phải quy mô tuyệt đối.
- Tắt trục: Bỏ trục Y 0%–100%, đường lưới và chú giải; ghi nhãn phần trăm trực tiếp trong từng đoạn.
- Làm tròn: Các phần trăm hiển thị trong một cột phải cộng đúng 100% (áp dụng làm tròn theo phần dư lớn nhất).
- Phân đoạn và màu: Tối đa 4 phân đoạn, đoạn lớn nhất ở gốc, thang xám đậm đến nhạt, thứ tự giữ nguyên ở mọi kỳ.
- Thông tin quy mô: Khi người đọc cần biết cả quy mô, ghi tổng tuyệt đối của từng cột ở một hàng riêng bên dưới trục thời gian.

> 🖼 Hình minh họa #5: assets/ibcs/figure-05.png

_Hình 1.7: Biểu đồ Cột Xếp Chồng 100% chuẩn IBCS® — Nhãn % trực tiếp, bỏ trục và chú giải_

### 1.8. Biểu đồ Thanh Xếp Chồng 100% (100% Stacked Bar Chart - Cơ Cấu Tương Đối Theo Danh Mục)

- Phạm vi áp dụng: So sánh cơ cấu tỷ trọng của các thành phần giữa nhiều danh mục phi thời gian.
- Sắp xếp: Sắp xếp các thanh theo tỷ trọng của phân đoạn đầu tiên (sát lề trái) giảm dần để lộ ra quy luật chênh lệch giữa các danh mục.
- Nhãn: Ghi % trực tiếp trong từng đoạn, tên phân đoạn viết một lần phía trên thanh đầu tiên; các % trong cùng thanh cộng đúng 100%.
- Trục và màu: Tắt trục X và lưới; tối đa 4 phân đoạn theo thang xám, thứ tự phân đoạn cố định.

> 🖼 Hình minh họa #6: assets/ibcs/figure-06.png

_Hình 1.8: Biểu đồ Thanh Xếp Chồng 100% chuẩn IBCS® — Sắp xếp theo tỷ trọng đoạn đầu, nhãn % trực tiếp_

### 1.9. Biểu đồ Đường (Line Chart - Dành Cho Xu Hướng & Chuỗi Thời Gian Dài)

- Phạm vi áp dụng: Áp dụng cho chuỗi thời gian liên tục có nhiều điểm dữ liệu (từ 12–24 kỳ trở lên) hoặc chỉ số biến động liên tục.
- KHÔNG NỐI ĐƯỜNG CONG MƯỢT (No Smooth Lines): Nối các điểm dữ liệu bằng đường thẳng (Straight line). Hạn chế dùng tính năng Smooth lines tạo đường cong ảo gây sai lệch giá trị thực tế tại các điểm trung gian. Nếu có dùng thì smooth type phải là cardinal.
- Gắn nhãn giá trị điểm mốc: Không dùng marker.

- Data labels: Line màu nào thì data labels màu đó.
- Kịch bản và tên chuỗi: AC là đường đậm màu tối; PY là đường xám nhạt cùng độ dày; FC dùng nét đứt. Tên chuỗi gắn trực tiếp ở đầu mút bên phải thay cho chú giải.
- Số lượng đường: Không để quá 3 đường cắt nhau trong một biểu đồ vì sẽ rất khó đọc

> 🖼 Hình minh họa #7: assets/ibcs/figure-07.png

_Hình 1.9: Biểu đồ Đường chuẩn IBCS® — Nối đoạn thẳng trung thực, gắn nhãn mốc quan trọng, tên chuỗi ở cuối đường_

### 1.12. Biểu đồ Kết Hợp Cột Và Đường (Line And Column Chart)

- Phạm vi áp dụng: Hiển thị đồng thời đại lượng tuyệt đối (cột, ví dụ doanh thu) và đại lượng tỷ lệ (đường, ví dụ biên lợi nhuận) trên cùng một trục thời gian.
- Không để lộ hai trục Y: Tắt cả trục chính và trục phụ; thay bằng nhãn giá trị trực tiếp, kèm đơn vị của từng chuỗi ghi trong phụ đề và tên chuỗi gắn ở mép phải.
- Data labels: Line màu nào thì data labels màu đó. Màu sắc của data labels trùng với màu cột nếu vị trí là outside end. Nếu vị trí data labels là inside base hoặc inside end thì màu đen hoặc trắng tuỳ theo màu cột
- Cột và đường: Cột bắt đầu từ gốc 0, tô theo ký hiệu kịch bản; đường nối bằng đoạn thẳng, không dùng marker.

> 🖼 Hình minh họa #8: assets/ibcs/figure-08.png

_Hình 1.12: Biểu đồ Kết Hợp chuẩn IBCS® — Không trục phụ, đường nằm tầng trên, nhãn trực tiếp kèm đơn vị_

### 1.16. Biểu đồ Phân Tán (Scatter Chart - Quan Hệ Giữa Hai Đại Lượng)

- Phạm vi áp dụng: Quan hệ giữa hai đại lượng số trên hai trục giá trị, mỗi điểm đại diện cho một đối tượng (sản phẩm, khách hàng, chi nhánh).
- Giữ lại hai trục: Khác với cột và thanh, giá trị trên cả hai trục đều là thông tin nên không tắt trục; vẽ trục mảnh 1px, chỉ ghi vài mốc chia cần thiết và đặt tiêu đề trục kèm đơn vị.
- Điểm và nhãn: Điểm xám nhạt viền mảnh; chỉ tô đậm và gắn tên cho các điểm nổi bật (ngoại lệ, đối tượng đang phân tích), không gắn nhãn cho mọi điểm.
- Đường tham chiếu: Có thể thêm đường trung vị hoặc mục tiêu bằng nét đứt mảnh, màu nhạt, ghi nhãn tên đường.
- Loại bỏ rác: Tắt lưới, viền khung và chú giải mặc định kiểu "Series1".

> 🖼 Hình minh họa #9: assets/ibcs/figure-09.png

_Hình 1.16: Biểu đồ Phân Tán chuẩn IBCS® — Nhãn điểm nổi bật, đường trung vị, trục mảnh có tiêu đề và đơn vị_

### 1.18. Biểu đồ Tròn (Pie Chart - Cơ Cấu Một Tổng Thể)

Ghi chú IBCS®: biểu đồ tròn là dạng khó so sánh chính xác các miếng, vì vậy chỉ dùng cho cơ cấu rất đơn giản và phải định dạng đúng các quy tắc bên dưới.

- Số lượng miếng: Tối đa 4 miếng; gộp các thành phần nhỏ vào miếng "Khác" đặt ở vị trí cuối.
- Thứ tự và điểm bắt đầu: Miếng đầu tiên bắt đầu tại vị trí 12 giờ, chạy theo chiều kim đồng hồ và sắp xếp giảm dần.
- Nhãn trực tiếp: Giá trị % in đậm kèm tên thành phần đặt ngay bên ngoài miếng; bỏ chú giải.
- Cấm hiệu ứng: Không dùng hiệu ứng 3D, tách miếng (explode), bóng đổ; chỉ dùng đường viền trắng mảnh để ngăn cách các miếng.
- Màu sắc: Thang xám từ đậm đến nhạt; nếu cần nhấn mạnh một thành phần thì chỉ tô đậm miếng đó.

> 🖼 Hình minh họa #10: assets/ibcs/figure-10.png

_Hình 1.18: Biểu đồ Tròn chuẩn IBCS® — Tối đa 4 miếng, bắt đầu ở 12 giờ, nhãn trực tiếp, không hiệu ứng_

### 1.19. Biểu đồ Vành Khuyên (Donut Chart - Cơ Cấu Có Tổng Ở Tâm)

Ghi chú IBCS®: giống biểu đồ Tròn, dạng vành khuyên có độ chính xác so sánh thấp; chỉ dùng cho cơ cấu đơn giản.

- Quy tắc kế thừa: Áp dụng toàn bộ quy tắc của biểu đồ Tròn: tối đa 4 phần, bắt đầu ở 12 giờ theo chiều kim đồng hồ, sắp xếp giảm dần, nhãn trực tiếp bên ngoài vành, không hiệu ứng.
- Giá trị ở tâm: Dùng khoảng trống ở giữa để ghi tổng thể bằng số lớn và đơn vị tính bằng chữ nhỏ.
- Độ dày vành: Giữ vành đủ dày (khoảng 35%–40% bán kính) để các phần vẫn so sánh được bằng mắt; chỉ dùng một vành duy nhất, không lồng nhiều vành.
- Màu sắc: Thang xám từ đậm đến nhạt, đường viền trắng mảnh giữa các phần.

> 🖼 Hình minh họa #11: assets/ibcs/figure-11.png

_Hình 1.19: Biểu đồ Vành Khuyên chuẩn IBCS® — Tối đa 4 phần, tổng ở giữa, nhãn trực tiếp_

### 1.20. Biểu đồ Treemap (Cơ Cấu Nhiều Danh Mục Theo Diện Tích)

- Phạm vi áp dụng: Thể hiện tỷ trọng của nhiều danh mục hoặc cấu trúc phân cấp khi số lượng quá nhiều để trình bày bằng thanh ngang.
- Thứ tự: Ô lớn nhất đặt ở góc trên bên trái, các ô sau giảm dần theo hướng đọc từ trái sang phải, từ trên xuống dưới.
- Màu sắc: Dùng thang xám theo độ lớn giá trị (đậm là lớn), không dùng bảng màu cầu vồng; đường viền trắng mảnh 1px giữa các ô.
- Nhãn: Tên và giá trị ghi trực tiếp ở góc trên bên trái của từng ô; các ô quá nhỏ không ghi nhãn mà gộp vào "Khác". Bỏ chú giải.
- Chú thích: Ghi rõ ở phụ đề rằng diện tích tỷ lệ với chỉ tiêu nào và đơn vị tính.

> 🖼 Hình minh họa #12: assets/ibcs/figure-12.png

_Hình 1.20: Biểu đồ Treemap chuẩn IBCS® — Thang xám theo giá trị, nhãn tên + số trong từng ô, viền mảnh_

### 1.23. Bảng Số Liệu Chuẩn IBCS (Tables & Embedded Variance Bars)

- Căn chỉnh dữ liệu: Văn bản/Danh mục căn trái (Left-aligned); Số liệu căn phải (Right-aligned) và sử dụng phông chữ monospace/tabular numbers để các chữ số thẳng hàng dọc.
- Định dạng dòng Tổng (Totals): Sử dụng đường kẻ đơn ở trên và đường gạch chân đôi (Double underline) bên dưới dòng Tổng cộng; dòng tổng in đậm và nằm ở cuối bảng.
- Embedded Variance Bars: Nhúng trực tiếp thanh đồ thị biểu diễn độ lệch tuyệt đối (Pinhead / Variance Bar) ngay trong cột của bảng để kết hợp sức mạnh giữa đọc số chính xác và nhận diện độ lệch thị giác.
- Bỏ đường kẻ thừa: Không kẻ khung ô đầy đủ và không tô xen kẽ màu dòng; dùng khoảng trắng thay cho đường kẻ dọc, chỉ giữ một đường kẻ mảnh dưới tiêu đề cột.
- Thứ tự cột và dấu: Các cột thời gian xếp theo thứ tự thời gian từ trái sang phải; dấu + chỉ dùng cho độ lệch, số độ lệch tô xanh khi thuận lợi và đỏ khi bất lợi.

> 🖼 Hình minh họa #13: assets/ibcs/figure-13.png

_Hình 1.23: Bảng số liệu chuẩn IBCS® — Căn chỉnh chuẩn xác, dòng tổng kẻ đôi, tích hợp thanh đồ họa độ lệch trực tiếp_

