# Lộ trình cài đặt và đưa DocManS vào sử dụng

Dành cho Ban chỉ đạo, Phòng KHQS và bộ phận CNTT của Học viện. Mô tả **làm gì, theo thứ tự nào, ai làm,
khi nào được chuyển bước**. Các thao tác kỹ thuật chi tiết nằm ở [Triển khai và vận hành](trien-khai-va-van-hanh.md)
(dẫn theo tên phần, vd. "B4", "C7").

Phiên bản đưa vào sử dụng: thẻ **`v1.0.0`** (nhánh `DocManS`, commit `8401265`, 17/10/2026). CI đạt; đã chạy thử
toàn bộ stack production, đi trọn luồng nghiệp vụ với 12 tài khoản thuộc đủ vai trò và diễn tập khôi phục.

Lịch dưới đây tính từ **thứ Hai 19/10/2026**, tổng cộng khoảng **14 tuần** tới khi dùng chính thức toàn Học viện.
Mốc nào trễ thì các mốc sau dời theo; không bỏ qua điều kiện chuyển bước.

---

## 1. Tổng quan

| Giai đoạn | Thời gian | Kết quả | Điều kiện chuyển bước |
|---|---|---|---|
| 0. Quyết định và chuẩn bị | Tuần 1 (19–23/10) | Có người phụ trách, máy chủ, 5 quyết định ở mục 3 | Ban chỉ đạo duyệt kế hoạch |
| 1. Dựng máy chủ | Tuần 2–3 (26/10–06/11) | Hệ thống chạy trên máy chủ thật, thư gửi được, sao lưu ra máy khác, đã diễn tập khôi phục | Cổng 1 |
| 2. Dữ liệu nền, tài khoản, tài liệu | Tuần 3–6 (02/11–27/11) | Đơn vị, danh mục, tài khoản cán bộ, lý lịch nhà khoa học; hướng dẫn cho mọi vai trò | Cổng 2 |
| 3. Nghiệm thu và tập huấn | Tuần 6–7 (23/11–04/12) | Nghiệm thu bằng tài khoản thật; mọi vai trò được tập huấn | Cổng 3 |
| 4. Vận hành thí điểm | Tuần 8–13 (07/12/2026–15/01/2027) | Một đợt tiếp nhận thật, Phòng KHQS + 2–3 đơn vị, chạy song song quy trình giấy | Cổng 4 |
| 5. Mở rộng toàn Học viện | Từ tuần 14 (18/01/2027) | Mọi đơn vị dùng; dừng quy trình giấy theo quyết định của Ban chỉ đạo | — |
| 6. Ổn định và phát triển tiếp | Sau 1–2 tháng dùng chính thức | Đánh giá, chọn tính năng đợt sau | — |

---

## 2. Tổ chức thực hiện

| Vai trò | Ai (đề xuất) | Trách nhiệm |
|---|---|---|
| Ban chỉ đạo | Phó Giám đốc phụ trách Khoa học | Duyệt kế hoạch, quyết định ở mục 3, ký chuyển bước ở cổng 3 và 4, ban hành văn bản đưa vào sử dụng |
| Chủ trì nghiệp vụ | Trưởng phòng KHQS; Trưởng ban QLKH làm đầu mối hằng ngày | Dữ liệu nền, tài khoản, nghiệm thu, tập huấn, tiếp nhận phản ánh nghiệp vụ |
| Vận hành kỹ thuật | 1–2 cán bộ CNTT (có người dự phòng) | Máy chủ, cài đặt, sao lưu, giám sát, cập nhật phiên bản, xử lý sự cố (phần B–H) |
| Phát triển | Nhóm phát triển DocManS | Sửa lỗi, công cụ nhập dữ liệu, phát hành bản vá, hỗ trợ mức 2 |
| Đầu mối đơn vị | Mỗi khoa/bộ môn thí điểm một người | Hỗ trợ người dùng tại đơn vị, gom phản ánh |

Họp điều phối: hằng tuần trong giai đoạn 1–4 (30 phút: tiến độ, vướng mắc, lỗi tồn đọng); hằng tháng từ giai đoạn 5.

---

## 3. Quyết định cần có trong tuần 1

| # | Câu hỏi | Phương án đề xuất | Ảnh hưởng nếu chưa quyết |
|---|---|---|---|
| 1 | **Đề tài cũ (đang thực hiện, đã nghiệm thu) có đưa vào hệ thống không?** Hiện chỉ tạo được đề tài từ hồ sơ đi hết quy trình trên hệ thống. | (a) Chỉ quản lý đề tài mới từ đợt tiếp nhận đầu tiên, đề tài cũ tiếp tục theo sổ sách; hoặc (b) làm công cụ nhập đề tài đang thực hiện từ Excel (khoảng 2–3 tuần phát triển, làm song song giai đoạn 2). Đề xuất: **(a) cho thí điểm, (b) trước khi mở rộng** nếu Ban chỉ đạo cần thống kê đầy đủ. | Dashboard, báo cáo, nhắc hạn thiếu đề tài cũ |
| 2 | **Lý lịch nhà khoa học nhập tay hay nhập từ Excel?** Hiện chuyên viên tạo từng hồ sơ. | Thí điểm: nhập tay cho các đơn vị thí điểm. Mở rộng: làm công cụ nhập Excel (khoảng 1 tuần) nếu số lý lịch trên 200. | Khối lượng nhập tay lớn ở giai đoạn 5 |
| 3 | **Phạm vi thí điểm** | Phòng KHQS + 2–3 khoa có đề xuất trong đợt tiếp nhận sắp tới; một đợt tiếp nhận thật. | Không lên được lịch giai đoạn 4 |
| 4 | **Chạy song song quy trình giấy trong thí điểm?** | Có: văn bản giấy vẫn là bản chính thức; hệ thống chạy song song, đối chiếu kết quả. Dừng giấy ở giai đoạn 5 theo quyết định riêng. | Rủi ro nghiệp vụ nếu hệ thống trục trặc |
| 5 | **Thẩm định an toàn thông tin** theo quy định của Học viện và Bộ Quốc phòng trước khi đưa hệ thống vào mạng nội bộ | Cán bộ CNTT xác định thủ tục và hồ sơ cần có ngay tuần 1 (hệ thống chỉ chạy trong mạng nội bộ, xem phần H). | Có thể chặn giai đoạn 1 |

---

## 4. Giai đoạn chi tiết

### Giai đoạn 0. Quyết định và chuẩn bị (tuần 1)

- Ban chỉ đạo giao người ở mục 2, quyết 5 câu hỏi ở mục 3.
- CNTT đặt yêu cầu: máy chủ (B1: 4 vCPU, 8 GB RAM, 100 GB SSD, Ubuntu 22.04/24.04 amd64), máy hoặc ổ sao lưu riêng,
  tên miền nội bộ, chứng chỉ TLS từ CA nội bộ, tài khoản SMTP của Học viện.
- Nhóm phát triển xuất image MinIO đã kiểm thử (`./scripts/minio-image.sh export`) để chép lên máy chủ (B3).
- Phòng KHQS lập danh sách: đơn vị (đối chiếu 84 đơn vị nạp sẵn), danh mục lĩnh vực, cấp đề tài, học hàm, học vị;
  danh sách lãnh đạo và cán bộ QLKH cần tài khoản (C4); chuyên viên phụ trách đơn vị nào (C5).

### Giai đoạn 1. Dựng máy chủ (tuần 2–3)

CNTT làm theo phần B và C1–C2, C6 của tài liệu vận hành:

1. Cài Docker, lấy mã nguồn **`git checkout v1.0.0`**, nạp image MinIO, khai `.env.production` (`APP_VERSION=1.0.0`).
2. Chứng chỉ TLS, khởi động, đăng nhập quản trị lần đầu, đổi mật khẩu, xoá `ADMIN_INITIAL_PASSWORD`.
3. **Thử thư thật** (C6). Nếu log API báo `STARTTLS ... not implemented` thì đặt `SMTP_REQUIRE_TLS=false` theo hướng dẫn.
4. Đặt lịch tự động (D1): sao lưu 01:30 rồi chép ra máy khác, cảnh báo chứng chỉ, giám sát `/api/v1/health/ready` 5 phút một lần.
5. **Diễn tập khôi phục** trên một máy thử (phần E): khôi phục bản sao lưu, đăng nhập, mở hồ sơ, tải tệp.

**Cổng 1** (CNTT xác nhận, Chủ trì nghiệp vụ ký):
- [ ] `dc ps` mọi service `healthy`; `/api/v1/health/ready` trả 200 qua tên miền thật, HTTPS hợp lệ trên trình duyệt của Học viện.
- [ ] Thư kích hoạt tới hộp thư thật trong vài phút.
- [ ] Có ít nhất 3 bản sao lưu liên tiếp trên máy sao lưu; diễn tập khôi phục thành công, ghi lại thời gian khôi phục.
- [ ] Cảnh báo giám sát gửi tới CNTT khi tắt thử container `minio`.
- [ ] Thủ tục an toàn thông tin (mục 3, câu 5) đã xong hoặc được phép chạy thí điểm.

### Giai đoạn 2. Dữ liệu nền, tài khoản, tài liệu (tuần 3–6)

**Phòng KHQS** (C3–C5):
- Rà và chỉnh đơn vị, danh mục trên giao diện quản trị.
- Tạo tài khoản lãnh đạo, Trưởng/Phó phòng, Trưởng ban, chuyên viên; CNTT cấp phạm vi nhiều đơn vị cho chuyên viên
  bằng `scripts/unit-scopes.sh` và kiểm tra bằng `list` cho từng người.
- Chuyên viên tạo lý lịch nhà khoa học cho các đơn vị thí điểm (hệ thống tự tạo tài khoản, gửi thư kích hoạt).
  Lãnh đạo và cán bộ QLKH tự kê khai lý lịch của mình.
- Giao mảng phụ trách cho chuyên viên (cấp đề tài, tính chất quân sự/dân sự) để hồ sơ nộp vào tự giao đúng người.

**Tài liệu hướng dẫn** (Phòng KHQS chủ trì, nhóm phát triển hỗ trợ): hiện mới có cho Trưởng ban QLKH và Trưởng phòng
KHQS. Cần thêm, mỗi vai trò 2–4 trang, theo đúng thao tác của vai trò:

| Ưu tiên | Vai trò |
|---|---|
| Trước thí điểm | Nhà nghiên cứu (lập, nộp, bổ sung hồ sơ; báo cáo tiến độ); Chuyên viên QLKH; Phản biện và thành viên hội đồng; Lãnh đạo phê duyệt (Giám đốc, Phó GĐ KH) |
| Trước mở rộng | Phó phòng, các Phó GĐ theo dõi, Quản trị hệ thống, báo cáo viên hội nghị, NCKH sinh viên |

Đồng thời bỏ tài khoản và mật khẩu của môi trường thử nghiệm khỏi hai hướng dẫn hiện có (phần H).

**Nhóm phát triển** (song song, mỗi việc phát hành bằng một thẻ `v1.0.x` qua quy trình phần F):

| Ưu tiên | Việc | Lý do |
|---|---|---|
| Trước thí điểm | Chặn tải văn bản khoa học nháp hoặc hết hiệu lực qua đường dẫn trực tiếp | Rủi ro bảo mật đã biết (A3) |
| Trước thí điểm | Nhật ký hệ thống có phân trang và lọc | Hiện chỉ xem được 100 dòng mới nhất |
| Trước thí điểm | "Việc của tôi" có tờ trình chờ duyệt và hồ sơ mới nộp chưa giao chuyên viên | Trưởng ban, Trưởng phòng đang phải xem ở nhiều nơi |
| Trước thí điểm | Thông báo từ chối (403) có lời giải thích tiếng Việt | Người dùng không hiểu vì sao bị chặn |
| Trước mở rộng | Cấp phạm vi đơn vị trên giao diện quản trị (thay script) | Thay đổi nhân sự thường xuyên |
| Trước mở rộng | Đóng đề tài yêu cầu mọi mốc hoàn thành và giải ngân đã xử lý (hoặc ghi rõ lý do) | Hiện đóng được khi còn mốc mở |
| Trước mở rộng | Công cụ nhập Excel (lý lịch; đề tài cũ nếu chọn phương án 1b) | Quyết định ở mục 3 |

**Cổng 2**:
- [ ] Mọi tài khoản cán bộ đã đăng nhập và đổi mật khẩu; phạm vi đơn vị đúng (kiểm tra ngẫu nhiên mỗi vai trò một người).
- [ ] Lý lịch nhà khoa học của các đơn vị thí điểm đã có, tài khoản đã kích hoạt (theo dõi danh sách chưa kích hoạt, gửi lại thư).
- [ ] Hướng dẫn cho các vai trò "trước thí điểm" đã có và được Phòng KHQS duyệt.
- [ ] Các việc phát triển "trước thí điểm" đã phát hành và cài lên máy chủ.

### Giai đoạn 3. Nghiệm thu và tập huấn (tuần 6–7)

- **Nghiệm thu** (C7): mỗi vai trò dùng tài khoản thật của mình, đi một luồng đầy đủ trên hồ sơ thử: đợt tiếp nhận →
  nộp hồ sơ kèm tệp → kiểm tra đầy đủ → hội đồng → chấm phiếu → tổng hợp → trình → phê duyệt → tải quyết định Word
  (kiểm tra mã số đề tài, tên và chức danh người ký) → lập đề tài → mốc → báo cáo → kinh phí. Ghi biên bản nghiệm thu
  theo từng bước: đạt / chưa đạt / ghi chú.
- **Tập huấn** theo nhóm vai trò, mỗi buổi 60–90 phút, thao tác trên dữ liệu thử:
  lãnh đạo (30 phút, tập trung phê duyệt và dashboard); Phòng KHQS (2 buổi); nhà nghiên cứu và đầu mối các đơn vị thí
  điểm; phản biện và hội đồng.
- Sau nghiệm thu: ngừng hoạt động hồ sơ và tài khoản thử (hệ thống không xoá hẳn hồ sơ), đánh dấu dữ liệu thử theo
  quy định.

**Cổng 3** (Ban chỉ đạo ký):
- [ ] Biên bản nghiệm thu: mọi bước của luồng chính đạt; lỗi còn lại không chặn nghiệp vụ và có hạn sửa.
- [ ] Mọi người dùng của đơn vị thí điểm đã được tập huấn.
- [ ] Văn bản của Học viện cho phép chạy thí điểm, nêu rõ phạm vi và việc chạy song song quy trình giấy.

### Giai đoạn 4. Vận hành thí điểm (tuần 8–13)

- Mở một **đợt tiếp nhận thật** cho các đơn vị thí điểm; mọi bước của đợt chạy trên hệ thống, văn bản giấy vẫn là bản chính thức.
- **Hỗ trợ người dùng**: một kênh duy nhất (điện thoại/nhóm tin nhắn của Phòng KHQS). Khi báo lỗi, người dùng gửi ảnh
  màn hình và thời điểm; CNTT tra log theo mã `X-Request-Id` (D2). Phân loại:

  | Mức | Ví dụ | Xử lý |
  |---|---|---|
  | Nghiêm trọng | Không đăng nhập được, mất dữ liệu, sai quyền (xem được hồ sơ không được phép) | CNTT xử lý trong ngày; báo nhóm phát triển ngay; cân nhắc tạm dừng |
  | Cao | Một bước nghiệp vụ không làm được, văn bản Word sai | Sửa trong tuần, phát hành bản vá |
  | Thường | Giao diện khó dùng, thông báo khó hiểu | Gom vào danh sách cải tiến |

- **Theo dõi hằng tuần** (họp điều phối): số hồ sơ nộp, số bước bị kẹt, số phản ánh theo mức, tỷ lệ người dùng đã kích
  hoạt tài khoản, thư gửi thất bại, kết quả sao lưu.
- **Cập nhật phiên bản**: tối đa một lần mỗi tuần, ngoài giờ làm việc, báo trước; luôn sao lưu ngay trước khi cập nhật (phần F).

**Cổng 4** (Ban chỉ đạo ký, sau khi đợt thí điểm đi tới phê duyệt):
- [ ] Đợt tiếp nhận thí điểm đã đi tới quyết định phê duyệt trên hệ thống; kết quả khớp với hồ sơ giấy.
- [ ] Không còn lỗi mức nghiêm trọng hoặc cao chưa sửa.
- [ ] Không có sự cố mất dữ liệu; sao lưu chạy đủ mọi ngày.
- [ ] Các việc phát triển "trước mở rộng" đã xong; quyết định về nhập dữ liệu cũ đã được thực hiện.
- [ ] Hướng dẫn cho mọi vai trò đã có.

### Giai đoạn 5. Mở rộng toàn Học viện (từ tuần 14)

- Mở rộng theo đợt 5–10 đơn vị mỗi tuần: tạo lý lịch và tài khoản, tập huấn đầu mối đơn vị, rồi mở đợt tiếp nhận.
- Nhập đề tài cũ (nếu chọn phương án 1b) trước khi dùng dashboard và báo cáo cho Ban chỉ đạo.
- Ban chỉ đạo ban hành văn bản dùng hệ thống chính thức và thời điểm dừng quy trình giấy cho từng loại việc.

### Giai đoạn 6. Ổn định và phát triển tiếp

Sau 1–2 tháng dùng chính thức, Phòng KHQS và nhóm phát triển đánh giá theo số liệu vận hành và phản ánh, rồi chọn việc
cho đợt sau. Các việc đã có thiết kế, đang chờ đánh giá vận hành:
- Giao việc và đầu việc dưới mốc, nhắc việc và leo thang (Đợt 2 trong [quan-ly-tien-do-nhiem-vu.md](../design/quan-ly-tien-do-nhiem-vu.md)).
- Mẫu "Báo cáo tình hình thực hiện NCKH" của Học viện; tối ưu báo cáo khi dữ liệu lớn.
- Quyền xem chỉ đọc cho vai trò Giám sát.
- Gia cố còn lại ở A3: CSP đầy đủ, CSRF token, khoá đăng nhập sai lưu bền.

---

## 5. Vận hành thường xuyên (từ giai đoạn 1)

| Tần suất | Việc | Ai | Tham chiếu |
|---|---|---|---|
| Tự động hằng ngày | Sao lưu và chép ra máy khác; nhắc hạn 07:00; giám sát 5 phút | Hệ thống | D1 |
| Hằng ngày | Trạng thái service, log lỗi API, kết quả sao lưu | CNTT | D2 |
| Hằng tuần | Dung lượng đĩa; Nhật ký hệ thống (đăng nhập sai nhiều, đặt lại mật khẩu, thao tác thất bại) | CNTT | D2 |
| Khi thay đổi nhân sự | Đổi đơn vị, khoá tài khoản, giao lại hồ sơ và đề tài, kiểm tra phạm vi | Phòng KHQS + CNTT | D3 |
| Hằng tháng | Cập nhật phiên bản theo lịch (nếu có), rà danh sách cải tiến | CNTT + nhóm phát triển | F |
| 6 tháng | Diễn tập khôi phục trên máy thử | CNTT | E |
| Trước khi chứng chỉ hết hạn 21 ngày | Thay chứng chỉ TLS | CNTT | B5, G |

---

## 6. Rủi ro và cách giảm

| Rủi ro | Khả năng | Cách giảm |
|---|---|---|
| Máy chủ thư của Học viện không gửi được ra, người dùng không kích hoạt được tài khoản | Trung bình | Thử ở giai đoạn 1; `SMTP_REQUIRE_TLS`; chuyên viên gửi lại thư kích hoạt; quản trị đặt lại mật khẩu |
| Người dùng ít, quay lại giấy tờ | Trung bình | Văn bản chỉ đạo; tập huấn theo vai trò; đầu mối đơn vị; "Việc của tôi" và thông báo nhắc |
| Thiếu dữ liệu đề tài cũ làm số liệu dashboard sai lệch | Cao nếu chọn 1a | Ghi rõ trên báo cáo "chỉ gồm đề tài từ đợt …"; phương án 1b trước mở rộng |
| Một máy chủ duy nhất hỏng | Thấp | Sao lưu hằng ngày ra máy khác; đã diễn tập khôi phục (mất tối đa 24 giờ dữ liệu, dựng lại trong 1 ngày làm việc) |
| Cập nhật phiên bản lỗi | Thấp | Sao lưu ngay trước khi cập nhật; `restore.sh` đã sửa để quay về bản cũ an toàn |
| Chỉ một người CNTT biết vận hành | Trung bình | Hai người được giao; cùng làm giai đoạn 1; tài liệu vận hành cập nhật theo thực tế |
| Lộ dữ liệu do sai phạm vi đơn vị | Thấp | Kiểm tra phạm vi ở cổng 2; rà Nhật ký hệ thống hằng tuần; mọi thao tác đều có dấu vết |
