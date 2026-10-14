# Phân cấp vai trò, chức danh đơn vị và luồng trình duyệt

Tài liệu cho Phòng Khoa học quân sự (KHQS), Ban giám đốc và quản trị viên hệ thống. Mô tả ai làm được gì, mỗi thủ tục đi qua những bước nào, và những việc quản trị viên phải làm khi đưa bản này lên máy chủ.

## 1. Vai trò

Vai trò quyết định **quyền** của tài khoản. Mỗi tài khoản có đúng một vai trò.

### Ban giám đốc

| Vai trò | Mã vai trò | Quyền |
|---|---|---|
| Giám đốc Học viện | `LEADERSHIP_APPROVAL_AUTHORITY` | Phê duyệt đề tài và kinh phí, phê duyệt thanh lý. Ký được mọi thủ tục mà Phó GĐ phụ trách Khoa học ký. |
| Phó Giám đốc phụ trách Khoa học | `SCIENCE_DEPUTY_DIRECTOR` | Ký thành lập hội đồng (đánh giá, nghiệm thu, đạo đức IRB), ký gia hạn và điều chỉnh đề tài (không đổi kinh phí). Không phê duyệt đề tài, kinh phí, thanh lý. |
| Phó Giám đốc (các Phó GĐ khác) | `RESEARCH_OVERSIGHT_AUTHORITY` | Chỉ theo dõi: tiến độ, số lượng đề tài, báo cáo kinh phí **tổng hợp**. Không xem kinh phí từng hồ sơ/đề tài, không ký. |

### Phòng KHQS (từ cao xuống thấp)

| Vai trò | Mã vai trò | Quyền |
|---|---|---|
| Trưởng phòng KHQS | `RESEARCH_MANAGEMENT_HEAD` | Duyệt mọi tờ trình trước khi lên Ban giám đốc. Giao mảng cho chuyên viên, đổi chuyên viên phụ trách hồ sơ. Điều phối được mọi hồ sơ trong phạm vi đơn vị. |
| Phó phòng KHQS | `RESEARCH_MANAGEMENT_DEPUTY_HEAD` | Chỉ theo dõi tiến độ và số lượng đề tài trong phạm vi. Không duyệt, kể cả khi Trưởng phòng vắng. |
| Trưởng ban QLKH (một người) | `RESEARCH_BOARD_HEAD` | Rà soát tờ trình của chuyên viên rồi trình Trưởng phòng, hoặc trả lại chuyên viên. Xem mọi hồ sơ trong phạm vi. |
| Chuyên viên QLKH | `RESEARCH_MANAGEMENT_STAFF` | Làm việc trên hồ sơ mình **phụ trách**: kiểm tra đầy đủ, yêu cầu bổ sung, mời phản biện và hội đồng, tổng hợp, lập tờ trình. Không thao tác trên hồ sơ của chuyên viên khác. |

Nguyên tắc chung: cấp trên xem được mọi thứ cấp dưới xem được; cấp dưới không thay đổi quyết định của cấp trên. Máy chủ kiểm tra mọi quyền; nút trên giao diện chỉ ẩn/hiện cho tiện.

## 2. Chức danh đơn vị (chỉ để hiển thị)

Chức danh **không** cấp quyền. Một nhà khoa học là Trưởng khoa vẫn là người dùng nghiên cứu thông thường; chức danh hiện cạnh tên tài khoản (thanh trên cùng, danh sách người dùng, hồ sơ nhà khoa học, danh sách chọn thành viên hội đồng).

| Loại đơn vị | Chức danh | Tối đa mỗi đơn vị |
|---|---|---|
| Viện | Giám đốc / Phó Giám đốc | 1 / 5 |
| Phòng | Trưởng phòng / Phó phòng | 1 / 2 |
| Khoa | Trưởng khoa / Phó khoa | 1 / 2 |
| Bộ môn | Chủ nhiệm Bộ môn / Phó Chủ nhiệm Bộ môn | 1 / 2 |

- Một người được kiêm nhiệm ở nhiều đơn vị (mỗi đơn vị một chức danh).
- Quản trị viên gán chức danh ở trang **Người dùng → Sửa → Chức danh tại đơn vị**.
- Loại đơn vị đặt ở trang **Đơn vị**. Đơn vị có sẵn đã được xếp loại theo tên (Viện…, Phòng…, Khoa…, Bộ môn…); đơn vị khác là "Khác".

## 3. Mảng đề tài và chuyên viên phụ trách

**Mảng** của một hồ sơ gồm hai tiêu chí: **cấp đề tài** (Cơ sở, Học viện, Bộ, Nhà nước, Học viên NCKH… theo danh mục loại đề tài) và **tính chất** (Quân sự / Dân sự — chủ nhiệm chọn trong hồ sơ đề xuất).

- Trưởng phòng giao mảng cho chuyên viên ở trang **Đánh giá hồ sơ → Mảng phụ trách của chuyên viên**. Mỗi mảng có thể chỉ nêu cấp ("Bộ"), chỉ nêu tính chất ("Dân sự"), hoặc cả hai ("Cơ sở – Quân sự"); một chuyên viên có nhiều mảng.
- Khi hồ sơ được nộp (hoặc nộp lại mà chưa có người phụ trách), hệ thống **tự giao** cho chuyên viên có mảng khớp. Nhiều người khớp: ưu tiên mảng cụ thể hơn, rồi người đang phụ trách ít hồ sơ hơn.
- Không ai khớp: hồ sơ hiện "Chưa có người phụ trách" (viền đỏ) để Trưởng phòng giao tay ngay trên bảng, hoặc bấm **Giao các hồ sơ chưa có người phụ trách** sau khi bổ sung mảng.

## 4. Luồng trình duyệt

Mọi thủ tục lên Ban giám đốc đi đúng bốn bước, không bỏ bước:

```
Chuyên viên lập, bấm "Trình Trưởng ban rà soát"
  → Trưởng ban QLKH: "Trình Trưởng phòng" hoặc "Trả lại"
  → Trưởng phòng KHQS: "Duyệt, gửi Ban giám đốc" hoặc "Trả lại"
  → Ban giám đốc ký (hoặc không phê duyệt / yêu cầu bổ sung)
```

- **Trả lại** ở bước nào cũng về chuyên viên lập, bắt buộc ghi lý do; thủ tục trở về trạng thái sửa được để chuyên viên sửa rồi trình lại.
- Trưởng ban/Trưởng phòng không tự rà soát tờ trình do chính mình lập và chỉ xử lý tờ trình trong phạm vi đơn vị của mình.
- Mỗi bước gửi thông báo cho người xử lý tiếp theo; lịch sử từng bước hiện ở mục **Tờ trình qua Phòng KHQS** trên trang hồ sơ/đề tài.

| Thủ tục | Bắt đầu từ | Người ký ở Ban giám đốc |
|---|---|---|
| Thành lập hội đồng đánh giá | Tờ trình hội đồng (sau khi mọi thành viên nhận lời) | Giám đốc hoặc Phó GĐ KH |
| Phê duyệt đề tài và kinh phí | Gói đánh giá đã chốt | Chỉ Giám đốc |
| Hội đồng đạo đức (IRB) | Đề xuất hội đồng IRB | Giám đốc hoặc Phó GĐ KH |
| Hội đồng nghiệm thu | Đề xuất hội đồng nghiệm thu | Giám đốc hoặc Phó GĐ KH |
| Gia hạn đề tài | Chuyên viên thẩm định đề nghị gia hạn | Giám đốc hoặc Phó GĐ KH |
| Điều chỉnh đề tài | Chuyên viên thẩm định đề nghị điều chỉnh | Giám đốc hoặc Phó GĐ KH |
| Thanh lý hợp đồng | Dự thảo biên bản thanh lý | Chỉ Giám đốc |

**Việc nhỏ chuyên viên tự làm, không qua trình duyệt:** xác nhận hồ sơ đầy đủ, yêu cầu bổ sung hồ sơ, phân công phản biện, theo dõi lời mời, xét báo cáo tiến độ.

### Lời mời phản biện và hội đồng

- Người được mời chỉ thấy **tên đề tài**, vai trò, hạn và người mời cho đến khi bấm **Đồng ý**; bấm **Từ chối** phải ghi lý do.
- Lời mời hội đồng gửi **trước khi trình**: chỉ trình được khi mọi thành viên đã nhận lời; người từ chối phải được thay. Thành viên đã nhận lời xem được hồ sơ khi Ban giám đốc ký quyết định thành lập.

## 5. Mỗi vai trò dùng trang nào

| Vai trò | Trang chính |
|---|---|
| Chuyên viên | Đánh giá hồ sơ (hồ sơ mình phụ trách), Tờ trình (theo dõi tờ trình đã lập), Theo dõi đề tài |
| Trưởng ban QLKH | Tờ trình (hàng chờ rà soát), Đánh giá hồ sơ (chỉ xem), Quản lý đề tài |
| Trưởng phòng | Tờ trình (hàng chờ duyệt), Đánh giá hồ sơ (điều phối, giao mảng), Theo dõi đề tài |
| Phó phòng | Dashboard, Đánh giá hồ sơ (chỉ xem), Theo dõi đề tài, Báo cáo |
| Giám đốc / Phó GĐ KH | Hồ sơ chờ phê duyệt / Hồ sơ chờ ký (mục Hội đồng, IRB; Giám đốc có thêm Duyệt đề tài, Duyệt kinh phí), trang đề tài (gia hạn, điều chỉnh, nghiệm thu, thanh lý) |
| Phó GĐ khác | Dashboard, Theo dõi đề tài, Báo cáo (kinh phí tổng hợp) |

### Theo dõi tổng hợp trên Dashboard

Trang **Dashboard** là nơi theo dõi chung của Phó phòng, Trưởng phòng, Trưởng ban và Ban giám đốc; mỗi người chỉ thấy số liệu trong phạm vi mình được xem.

- Bộ lọc: năm, đơn vị, cấp, lĩnh vực, **tính chất** (Quân sự / Dân sự / Chưa phân loại). Tính chất của đề tài lấy theo hồ sơ đề xuất gốc.
- Mục **Theo tính chất và chuyên viên phụ trách**: số đề tài, hồ sơ theo tính chất; bảng theo từng chuyên viên (số đề tài, quá hạn, chậm tiến độ, báo cáo trễ, hồ sơ, hồ sơ đang xét) và nhóm "Chưa có người phụ trách". Bấm số để mở danh sách chi tiết.
- **Tải báo cáo Excel** có thêm cột Tính chất và Chuyên viên phụ trách.
- Các Phó GĐ chỉ theo dõi thấy kinh phí **tổng** (thẻ số, biểu đồ), còn cột kinh phí từng đề tài/hồ sơ để trống.

## 6. Việc quản trị viên làm khi đưa bản này lên máy chủ

Migration tự chạy khi khởi động (`docker compose ... up -d`), nên trước đó chạy `./scripts/backup.sh`. Sau khi hệ thống lên:

1. **Đổi vai trò** (trang Người dùng → Sửa): tài khoản Trưởng ban QLKH → *Trưởng ban QLKH*; Phó phòng KHQS → *Phó phòng KHQS*; Phó Giám đốc phụ trách Khoa học → *Phó Giám đốc phụ trách Khoa học*; các Phó Giám đốc khác giữ *Phó Giám đốc*.
2. **Cấp phạm vi đơn vị** cho Phó GĐ phụ trách Khoa học, Phó phòng, Trưởng ban giống Giám đốc/Trưởng phòng: lãnh đạo chỉ thấy hồ sơ của các đơn vị mình có phạm vi.
3. **Kiểm tra loại đơn vị** ở trang Đơn vị (Viện/Phòng/Khoa/Bộ môn) rồi **gán chức danh** cho các tài khoản cần hiển thị.
4. Trưởng phòng **giao mảng cho chuyên viên**, rồi bấm **Giao các hồ sơ chưa có người phụ trách**. Trước bước này, hồ sơ đang thẩm định chưa có người phụ trách chỉ Trưởng phòng thao tác được.

Tờ trình đã nằm chờ Ban giám đốc từ trước khi lên bản vẫn ký được như cũ; tờ trình mới đi theo luồng ở mục 4.

## 7. Kiểm thử

- `tests/role-hierarchy-e2e-db.test.mjs`: toàn luồng trên PostgreSQL thật với đủ vai trò, từ nộp hồ sơ đến Giám đốc phê duyệt.
- `tests/approval-routing-db.test.mjs`: luồng trình duyệt (không bỏ bước, sai người bị chặn, trả lại, người ký).
- `tests/role-hierarchy.test.mjs`, `tests/evaluation-coordination-db.test.mjs`, `tests/unit-positions-db.test.mjs`: quyền theo vai trò, giao mảng, chức danh.
