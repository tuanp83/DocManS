# Dashboard thống kê nâng cao & drill-down — Đợt 2: giao diện

Đợt 2 dựng trang `/dashboard` trên các API của Đợt 1 (`docs/design/dashboard-thong-ke-dot-1.md`). Không thêm
quyền mới: trình duyệt chỉ hiển thị những gì API đã lọc theo quyền xem; không có logic "ai thấy gì" ở giao diện.

## 1. Bố cục

1. **Một hàng bộ lọc chung** phía trên mọi thứ: khoảng thời gian cho xu hướng (3 / 6 / 12 / 24 tháng), Năm,
   Đơn vị, Cấp, Lĩnh vực. Mọi ô số, biểu đồ và danh sách chi tiết dùng cùng bộ lọc. Bộ lọc được ghi vào URL
   (`?unitId=…&level=…&range=12`) để gửi đường dẫn cho người khác. Danh sách lựa chọn lấy từ số liệu chưa lọc
   của chính người xem, nên không liệt kê đơn vị / cấp / lĩnh vực người đó không được thấy.
   Năm áp dụng cho đề tài theo năm bắt đầu, hồ sơ theo năm nộp; không áp dụng cho biểu đồ xu hướng.
2. **Đề tài đang quản lý**
   - Ô số: số đề tài, chậm tiến độ (kèm số cần chú ý), quá hạn, kinh phí đã cấp / tổng.
   - Sức khoẻ theo tuần: cột chồng Xanh / Vàng / Đỏ / Không đánh giá từ ảnh chụp hằng tuần, cột cuối là hiện tại.
   - Đường cong S: % khối lượng kế hoạch và thực tế bình quân theo tuần (một trục 0–100%).
   - Bản đồ nhiệt đơn vị × sức khoẻ: bấm ô → danh sách đề tài của đơn vị ở mức đó; cột Tổng → mọi đề tài của đơn vị.
   - Kinh phí theo đơn vị (tổng / đã cấp — cùng đơn vị tiền, một trục), đề tài theo cấp, theo trạng thái.
3. **Sản phẩm**: sản phẩm đề tài theo dạng 1–6, chồng theo trạng thái (bấm đoạn → danh sách sản phẩm dạng đó ở
   trạng thái đó); sản phẩm đầu ra của hồ sơ theo loại.
4. **Hồ sơ đề xuất**: ô số (hồ sơ, chờ xử lý, đã duyệt, quá hạn); theo đơn vị, trạng thái, lĩnh vực, năm nộp.

Các ô số KPI cũ (đọc `/dashboard/stats`, không theo bộ lọc) và hai biểu đồ cũ được thay bằng các phần trên.
API `/dashboard/stats` vẫn giữ cho tương thích.

## 2. Danh sách chi tiết (drill-down)

Bấm vào một số / thanh / ô / đoạn màu mở bảng trượt từ phải, gọi `GET /dashboard/drill-down` với bộ lọc chung
cộng bộ lọc của chỗ được bấm (bộ lọc của chỗ được bấm thắng khi trùng khoá, ví dụ bấm một đơn vị). Bảng:

- Đề tài: mã · tên (liên kết tới trang đề tài), đơn vị · chủ nhiệm, trạng thái, sức khoẻ, % kế hoạch / thực tế,
  SPI, số ngày trễ, ngày kết thúc, kinh phí. Nút **Gantt** chuyển sang biểu đồ Gantt của đúng các đề tài đó:
  thanh nhạt là thời gian thực hiện, phần đậm là % thực tế, vạch đứng là % kế hoạch, đường dọc là hôm nay.
- Hồ sơ, sản phẩm, sản phẩm đầu ra: các cột tương ứng, liên kết tới hồ sơ / đề tài.
- Phân trang 50 dòng; Esc hoặc bấm nền để đóng; tiêu điểm về lại chỗ đã bấm.

## 3. Quy ước biểu đồ

- Vẽ bằng SVG/HTML trong `components/dashboard/viz.tsx`, không dùng thư viện vẽ: nét 2px, cột ≤ 24px bo 4px ở
  đầu, khe 2px giữa các đoạn chồng, lưới mảnh, chú giải luôn có khi ≥ 2 chuỗi.
- Tooltip khi rê chuột; với bàn phím, mỗi biểu đồ là một điểm dừng Tab, phím ←/→ chuyển cột / điểm và trình đọc
  màn hình đọc số liệu của điểm đang chọn. Tooltip không phải đường duy nhất để đọc số: mỗi biểu đồ có nút
  **Bảng** hiện bảng số liệu tương đương.
- Nhóm "Chưa phân loại" (không có cấp / lĩnh vực) hiện như hàng thường, không bấm được vì API không lọc theo giá
  trị rỗng. Giá trị bộ lọc trong URL không có trong lựa chọn của người xem bị bỏ khi tải trang.
- Bảng chi tiết là hộp thoại modal: tiêu điểm được giữ trong bảng, trang phía sau không cuộn.
- Xu hướng không gửi `to`: API lấy "hôm nay" theo giờ Việt Nam, nên cột hiện tại không mất vào 0–7 giờ sáng.
- Màu trong `globals.css` (`.viz-root`):
  - phân loại `--series-1…5`, thứ tự cố định, đã chạy bộ kiểm tra bảng màu (phân biệt với người mù màu) trên nền
    trắng; ba màu sáng dưới 3:1 nên luôn có nhãn / bảng đi kèm;
  - trạng thái `--status-good / warning / critical` chỉ dùng cho sức khoẻ đề tài, luôn kèm nhãn chữ;
  - thang tuần tự một sắc xanh lam `--seq-0…6` cho bản đồ nhiệt (chữ trắng trên bậc đậm).
- Khi đổi bộ lọc, biểu đồ cũ mờ đi trong lúc tải, không nhấp nháy khung trống.

## 4. Thay đổi API nhỏ đi kèm

- `distribution?subject=projects` thêm `byUnitHealth` cho bản đồ nhiệt và `byYear` (năm bắt đầu) cho lựa chọn Năm.
- Dòng drill-down `projects` thêm `startDate` cho Gantt.

## 5. Kiểm thử

- `tests/dashboard-ui-source.test.mjs`: trang dùng bộ thống kê mới; client chỉ gọi 4 API, chỉ gửi khoá đã khai
  báo; không quyết định hiển thị theo vai trò; không chèn HTML thô; mọi biểu đồ có bảng; drill-down gọi đúng API;
  màu lấy từ token.
- `tests/dashboard-analytics.test.mjs`: thêm kiểm tra `byUnitHealth`, `startDate`.
- Đã dựng trang với dữ liệu mẫu trong Chromium (máy tính 1280px và điện thoại 390px), kiểm tra bố cục, tooltip,
  bảng chi tiết và Gantt.

## 6. Để Đợt 3

Xuất Excel từ bảng chi tiết (kèm chặn công thức Excel trong dữ liệu), mẫu "Báo cáo tình hình thực hiện NCKH",
tối ưu truy vấn (< 500 ms).
