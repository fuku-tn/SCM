# Ruleset: Chọn và bố cục biểu đồ

Kết hợp với `references/ibcs-standard.md` và `references/chart-standards.md` của chặng Dashboard.

## Chọn biểu đồ theo câu hỏi
| Câu hỏi | Biểu đồ | Tránh |
|---|---|---|
| Con số hiện tại là bao nhiêu? | Thẻ KPI (card) + so sánh kỳ | Gauge trang trí |
| Biến đổi theo thời gian? | Line / column theo tháng | Pie theo thời gian |
| So sánh giữa các nhóm? | Bar ngang đã sắp xếp (Top N) | Pie > 5 lát |
| Cơ cấu / tỷ trọng? | Stacked 100% hoặc donut ≤ 5 phần | 3D |
| Quan hệ 2 độ đo? | Scatter | Dual-axis gây hiểu lầm |
| Chi tiết tra cứu? | Table / matrix (ít cột, có định dạng điều kiện) | Bảng 20 cột |
| Đóng góp vào thay đổi? | Waterfall | — |

## Bố cục trang
1. **Trên cùng: 4–6 thẻ KPI** (luật cứng), mỗi thẻ có giá trị + so sánh kỳ.
2. **Giữa: xu hướng theo thời gian** (biểu đồ rộng nhất).
3. **Dưới: phân rã theo chiều** (khu vực, nhóm...), có Top/Bottom N.
4. **Slicer** ở cạnh hoặc trên cùng, ≤ 4 slicer/trang; ưu tiên Ngày, Khu vực, Nhóm.
5. Mỗi trang có **một thông điệp chính**, tiêu đề trang nêu thông điệp, không chỉ là tên chủ đề.

## IBCS tối thiểu
- Cùng một độ đo → cùng thang đo/đơn vị giữa các biểu đồ cạnh nhau.
- Thực tế (Actual) màu đặc; kế hoạch/năm trước viền hoặc xám.
- Tiêu đề biểu đồ: "Độ đo theo Chiều, đơn vị, kỳ".
- Sắp xếp giảm dần cho so sánh nhóm; thời gian theo trục thời gian.
- Không dùng màu chỉ để trang trí; màu = ý nghĩa (tốt/xấu/trung tính).

## Bám template
- Khi người dùng chọn template Power BI: giữ giao diện, chỉ gắn lại dữ liệu; phần nào không có dữ liệu phù hợp thì loại bỏ thay vì để trống.
- Không thêm quá 6 thẻ KPI/trang kể cả khi template gốc có nhiều hơn.

## Lỗi thường gặp
- Hai trục Y khác đơn vị trên một biểu đồ.
- Nhãn dữ liệu chồng chéo; quá nhiều series (> 6).
- Biểu đồ không có kết nối tới KPI (không giúp trả lời câu hỏi nào).

## Giới hạn số giá trị hiển thị (cardinality)
Trước khi gắn một chiều vào biểu đồ, xem số giá trị khác nhau (`distinct`) của cột đó:
| Biểu đồ | Tối đa | Nếu vượt |
|---|---|---|
| Bar ngang | 15 | Top N (mặc định 10) hoặc chọn chiều gộp nhóm hơn |
| Column | 12 | Top N (mặc định 10); thời gian dài thì dùng line |
| Stacked bar/column | 8–10 | Top N + gộp phần còn lại; cân nhắc 100% stacked |
| Line (nhiều series) | 5–8 series | Chỉ vẽ Top N series, hoặc lọc bằng slicer |
| Donut / Pie | 5 | KHÔNG dùng; đổi sang bar Top N hoặc chiều ít giá trị hơn (tỷ trọng chỉ đúng khi đủ cả tập) |
| Treemap | 20 | Top N (mặc định 15) |
Top N được làm bằng measure xếp hạng (script sinh DAX) — tiêu đề nên ghi rõ "Top N" để người xem biết đây không phải toàn bộ.
