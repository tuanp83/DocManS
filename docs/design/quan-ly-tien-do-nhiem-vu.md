# Thiết kế: Quản lý tiến độ nhiệm vụ KH&CN (nâng cao)

Nhánh: `feat/project-progress` · Phạm vi: nhiệm vụ KH&CN đã được phê duyệt (module `approved-projects`)
và các đầu việc giao cho thành viên. Tài liệu này mô tả đủ 3 đợt; **Đợt 1 đã được hiện thực trên nhánh**.

Đáp ứng các mục trong thuyết minh: 2.2 (theo dõi đề tài: kế hoạch, mốc, báo cáo định kỳ, điều chỉnh,
gia hạn, sản phẩm), 2.4 (giao việc, nhắc việc, thống kê đúng hạn/quá hạn), 2.5 (dashboard: việc chờ xử lý,
việc quá hạn, đề tài chậm tiến độ).

---

## 1. Hiện trạng trước nhánh này

| Đã có | Còn thiếu |
| --- | --- |
| Đề tài sau phê duyệt với trạng thái `preparing → executing → paused → pending_acceptance → accepted / failed / closed` | Phần trăm hoàn thành, so sánh kế hoạch với thực tế |
| Mốc (`ProjectMilestone`) có hạn, người phụ trách, trạng thái `open / completed` | Kế hoạch gốc: sau gia hạn mất dấu đề tài từng trễ bao lâu |
| Kỳ báo cáo (`ProjectCheckpoint`) và báo cáo định kỳ có vòng xét duyệt | Đầu việc dưới mốc; trang `/tasks`, `/my-tasks` chỉ là dữ liệu mẫu |
| Đề nghị điều chỉnh, gia hạn có thẩm định và lịch sử | Nhắc việc, leo thang tự động |
| Cờ `overdue` / `approaching` (14 ngày) tính khi mở danh sách | Sản phẩm khoa học gắn tiến độ; liên kết giải ngân với mốc |

---

## 2. Nguyên tắc thiết kế

1. **Hệ thống gắn cờ, con người kết luận.** Chỉ số được tính tự động; mức sức khoẻ chính thức có thể được
   chuyên viên phụ trách ghi đè kèm lý do, lưu lịch sử.
2. **Kế hoạch gốc bất biến.** Mỗi lần kế hoạch được phê duyệt (thiết lập, điều chỉnh mốc, gia hạn) tạo một
   phiên bản mới; không sửa phiên bản cũ.
3. **Không thêm quyền ngầm.** Mọi thao tác mới đi qua capability `projectViewerAuthorizationV1`, kiểm tra
   trên từng đề tài, có `contextVersion`, ghi trong giao dịch `Serializable` và có audit.
4. **Cập nhật tiến độ không làm hỏng thao tác khác.** Cập nhật phần trăm và đánh giá sức khoẻ không tăng
   `aggregateVersion`, để không vô hiệu hoá bản nháp yêu cầu đang mở của chủ nhiệm.
5. **Tính ở máy chủ, một nguồn công thức.** Công thức nằm trong `project-progress.ts` (hàm thuần, có test).

---

## 3. Mô hình dữ liệu

### Đợt 1 (đã hiện thực, migration `20261010020000_project_progress_tracking`)

| Bảng / trường | Nội dung |
| --- | --- |
| `project_milestones.weight_percent` | Trọng số mốc (0–100, có thể trống). Nếu mọi mốc đều có trọng số và tổng = 100 thì dùng; nếu không, chia đều. |
| `project_milestones.progress_percent` | Phần trăm tự đánh giá (0–100), mặc định 0; mốc hoàn thành = 100. |
| `project_milestones.planned_start_date` | Ngày bắt đầu dự kiến (tuỳ chọn), dùng để rải kế hoạch. |
| `project_milestones.completed_at`, `progress_updated_at` | Thời điểm hoàn thành và lần cập nhật cuối. |
| `project_plan_baselines` | Phiên bản kế hoạch: `version`, `source` (`setup`, `adjustment`, `extension`, `backfill`), `source_request_id`, `start_date`, `end_date`, `milestones` (JSON: id, tiêu đề, hạn, trọng số), người tạo. Duy nhất theo (`project_id`, `version`). |
| `project_milestone_progress_updates` | Nhật ký cập nhật tiến độ: phần trăm trước/sau, ghi chú, người cập nhật. |
| `project_health_assessments` | Đánh giá sức khoẻ của chuyên viên: mức (`green/amber/red`), mức hệ thống tính lúc đánh giá, lý do, ảnh chụp chỉ số. |

Migration điền ngược: mốc đã hoàn thành có `progress_percent = 100`, `completed_at = updated_at`;
đề tài đã qua bước chuẩn bị được tạo kế hoạch gốc phiên bản 1 (`source = 'backfill'`) từ các mốc hiện có.

### Đợt 2

| Bảng | Nội dung |
| --- | --- |
| `project_work_items` | Đầu việc dưới mốc, nhiều cấp (`parent_id`): người được giao (thành viên đề tài), người giao, bắt đầu, hạn, ưu tiên, trạng thái `todo / doing / blocked / review / done / cancelled`, phần trăm. |
| `project_work_item_dependencies` | Quan hệ trước–sau (finish-to-start) giữa đầu việc. |
| `project_work_item_updates` | Nhật ký cập nhật, minh chứng (`file_records`, `relatedEntityType = approved_project`). |
| `notification_dispatch_log` | Khoá chống trùng cho nhắc việc: (`rule`, `target_id`, `recipient_id`, `period_key`) duy nhất. |

Khi mốc có đầu việc, phần trăm mốc = trung bình có trọng số (theo số ngày dự kiến) của đầu việc; chủ nhiệm
không tự nhập phần trăm cho mốc đó nữa.

### Đợt 3

| Bảng | Nội dung |
| --- | --- |
| `project_deliverables` | Sản phẩm khoa học: loại (bài báo trong nước/quốc tế, sáng chế, quy trình, đào tạo ThS/TS…), số cam kết theo thuyết minh, số đạt, minh chứng, chuyên viên xác nhận. |
| `project_health_snapshots` | Ảnh chụp chỉ số hằng tuần để vẽ xu hướng. |
| Liên kết giải ngân–mốc | Mỗi đợt giải ngân có `milestone_id`; chỉ đề nghị giải ngân khi mốc đã được chấp nhận. |

---

## 4. Chỉ số tiến độ (Đợt 1)

Ký hiệu: `w_i` là trọng số mốc i (đơn vị %), hôm nay là `t`.

**Tiến độ kế hoạch** — theo phiên bản kế hoạch gốc mới nhất. Mỗi mốc có cửa sổ `[s_i, d_i]`:
`s_i` = `planned_start_date`, nếu trống thì hạn của mốc liền trước, nếu là mốc đầu thì ngày bắt đầu đề tài;
`d_i` = hạn mốc trong kế hoạch gốc.

```
planned = Σ w_i × clamp((t − s_i) / (d_i − s_i), 0, 1)
```

**Tiến độ thực tế** — theo mốc hiện hành:

```
actual = Σ w_i × (100 nếu mốc completed, ngược lại min(progress_percent, 99)) / 100
```

Mốc chỉ được tính đủ 100% khi các kỳ báo cáo của nó đã được chuyên viên chấp nhận (luồng hiện có).

**Chỉ số tiến độ** `SPI = actual / planned`, chỉ tính khi `planned ≥ 5` (đầu kỳ, mẫu số quá nhỏ).

**Độ trễ**:
- `maxDaysOverdue`: số ngày quá hạn lớn nhất trong các mốc chưa hoàn thành.
- `slipDays` mỗi mốc: hạn hiện hành (hoặc ngày hoàn thành) trừ hạn trong kế hoạch gốc **phiên bản 1** —
  giữ được độ trễ thật kể cả sau khi được gia hạn.
- `lateReports`: số kỳ báo cáo đang mở đã quá hạn.

**Mức sức khoẻ** (chỉ áp dụng cho đề tài `executing` hoặc `paused`):

| Mức | Điều kiện (mặc định, đặt trong `DEFAULT_HEALTH_THRESHOLDS`) |
| --- | --- |
| Đỏ | `SPI < 0,75`, hoặc mốc trễ > 30 ngày, hoặc ≥ 2 kỳ báo cáo trễ, hoặc đã quá ngày kết thúc |
| Vàng | `SPI < 0,90`, hoặc mốc trễ > 7 ngày, hoặc 1 kỳ báo cáo trễ |
| Xanh | Các trường hợp còn lại |

Mỗi kết luận kèm danh sách lý do bằng tiếng Việt để người xem hiểu vì sao.

**Ghi đè của chuyên viên.** Mức chính thức = đánh giá gần nhất của chuyên viên **nếu** mức hệ thống lúc đó
vẫn bằng mức hệ thống hiện tại; khi mức hệ thống đổi, đánh giá cũ hết hiệu lực và giao diện báo "cần đánh giá lại".

---

## 5. Quyền (mô hình 7 vai trò)

| Thao tác | Chủ nhiệm | Thành viên phụ trách mốc | Chuyên viên phụ trách | Trưởng phòng QLKH | Lãnh đạo | Giám sát | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Xem tiến độ (`project.read`) | Có | Có | Có | Có (phạm vi) | Có | Chưa (đợt 3) | Không |
| Cập nhật tiến độ mốc (`project.progress.update`) | Mọi mốc | Mốc mình phụ trách | Không | Không | Không | Không | Không |
| Đặt trọng số khi thiết lập (`project.setup.configure`) | Không | Không | Có | Khi được phân công | Không | Không | Không |
| Đánh giá sức khoẻ (`project.health.assess`) | Không | Không | Có | Khi được phân công | Không | Không | Không |
| Đổi trọng số sau khi chạy | Đề nghị điều chỉnh | Không | Duyệt điều chỉnh | — | — | — | — |

Ràng buộc chung giữ nguyên: người tham gia đề tài không được làm chuyên viên phụ trách; xung đột phản biện bị
chặn; chỉ thao tác khi đề tài `executing` (cập nhật tiến độ) hoặc `executing/paused` (đánh giá).

Vai trò Giám sát hiện chưa có quyền xem đề tài; việc mở quyền chỉ đọc cho vai trò này cần quyết định nghiệp vụ
riêng (đợt 3).

---

## 6. API

### Đợt 1

| Phương thức | Đường dẫn | Mô tả |
| --- | --- | --- |
| `GET` | `/api/v1/projects/:id/progress` | Chỉ số, từng mốc (trọng số, hạn gốc v1, hạn kế hoạch hiện hành, hạn hiện tại, độ trễ), các phiên bản kế hoạch, 20 cập nhật gần nhất, 10 đánh giá gần nhất. |
| `POST` | `/api/v1/projects/:id/milestones/:milestoneId/progress` | `{ progressPercent, note?, contextVersion }`. |
| `POST` | `/api/v1/projects/:id/health-assessments` | `{ level, reason, contextVersion }`. |
| `GET` | `/api/v1/projects?health=red\|amber\|green` | Danh sách có thêm `progressSummary` cho mỗi đề tài. |
| `GET` | `/api/v1/work-queue` | "Việc của tôi": mọi việc đang chờ người dùng, sắp xếp quá hạn trước, rồi theo hạn. |
| `POST` | `/api/v1/projects/:id/setup` | (mở rộng) mỗi mốc nhận thêm `weightPercent`, `plannedStartDate`. |
| `POST` | `.../requests/adjustment` | (mở rộng) `milestoneChanges[]` nhận thêm `weightPercent`. |

Kế hoạch gốc được tạo tự động: phiên bản 1 khi xác nhận thiết lập; phiên bản mới khi duyệt điều chỉnh có
thay đổi hạn hoặc trọng số mốc, hoặc duyệt gia hạn.

Thay đổi hành vi so với trước nhánh này:
- Xác nhận bắt đầu thực hiện yêu cầu đã có ít nhất một mốc (`SETUP_INCOMPLETE`) và trọng số hợp lệ (`WEIGHTS_INVALID`).
- Điều chỉnh chỉ đổi trọng số (không đổi hạn, tên) được áp dụng cho mọi mốc, không chỉ mốc quan trọng; tổng
  trọng số sau điều chỉnh được kiểm tra ngay khi tạo, sửa và nộp đề nghị.

"Việc của tôi" gồm: nộp báo cáo đến hạn (≤ 30 ngày) hoặc quá hạn, bổ sung báo cáo/yêu cầu, cập nhật tiến độ
mốc mình phụ trách, xét báo cáo, xét điều chỉnh, thẩm định gia hạn, thiết lập mốc, đánh giá sức khoẻ khi đề
tài Vàng/Đỏ chưa được đánh giá, quyết định gia hạn (lãnh đạo), phân công chuyên viên (Trưởng phòng, lãnh
đạo), phiếu phản biện chưa nộp.

### Đợt 2

`/api/v1/projects/:id/work-items` (CRUD, giao việc, cập nhật), `/api/v1/work-items/mine`, cấu hình ngưỡng tại
`system_parameters` (`project.health.thresholds`, `project.reminder.rules`).

### Đợt 3

`/api/v1/projects/:id/deliverables`, `/api/v1/projects/:id/health-history`, `/api/v1/reports/project-progress.xlsx|docx`.

---

## 7. Giao diện

### Đợt 1 (đã hiện thực)

- **Trang đề tài → "Kế hoạch và tiến độ"**: 5 ô chỉ số (kế hoạch, thực tế, SPI, trễ lớn nhất, sức khoẻ);
  dòng thời gian từng mốc vẽ bằng SVG (hạn gốc, hạn hiện tại, thanh phần trăm); bảng mốc; biểu mẫu cập nhật
  tiến độ (chủ nhiệm, thành viên phụ trách); biểu mẫu đánh giá sức khoẻ (chuyên viên phụ trách); nhật ký.
- **Thiết lập mốc**: nhập nhiều mốc, mỗi mốc có trọng số, ngày bắt đầu dự kiến, người phụ trách; hiển thị tổng
  trọng số và chặn lưu khi tổng khác 100 (nếu có nhập).
- **Theo dõi đề tài**: dải đếm Đỏ/Vàng/Xanh, cột sức khoẻ, SPI, thực tế/kế hoạch; lọc theo mức.
- **Việc của tôi** (`/my-tasks`): thay dữ liệu mẫu bằng dữ liệu thật; hiện trong menu cho các vai trò có việc.

### Đợt 2

Kanban đầu việc theo đề tài; giao việc; "Việc được giao cho tôi"; email tổng hợp hằng tuần.

### Đợt 3

Gantt đầy đủ (đầu việc, phụ thuộc, đường găng), đường cong chữ S kế hoạch/thực tế, bảng chéo đơn vị × mức
sức khoẻ trên Dashboard, xuất báo cáo tình hình thực hiện theo mẫu Học viện.

---

## 8. Nhắc việc và leo thang (Đợt 2)

Tác vụ hằng ngày 06:00 (`@nestjs/schedule`), chạy dưới `pg_try_advisory_lock` để chỉ một bản API thực hiện:

| Khi | Gửi cho |
| --- | --- |
| 7 ngày và 1 ngày trước hạn mốc/kỳ báo cáo/đầu việc | Người phụ trách (thành viên hoặc chủ nhiệm) |
| 3 ngày sau hạn | Chuyên viên phụ trách |
| 14 ngày sau hạn, hoặc đề tài chuyển sang Đỏ | Trưởng phòng QLKH có phạm vi đơn vị |
| Thứ Hai hằng tuần | Email tổng hợp cho chủ nhiệm và chuyên viên |

Mỗi lần gửi ghi vào `notification_dispatch_log`; khoá duy nhất bảo đảm chạy lại không gửi trùng.

---

## 9. Lộ trình và tiêu chí nghiệm thu

| Đợt | Nội dung | Tiêu chí nghiệm thu |
| --- | --- | --- |
| 1 | Kế hoạch gốc, trọng số, chỉ số, sức khoẻ, đánh giá ghi đè, danh sách theo dõi, Việc của tôi | (1) Đề tài có 3 mốc trọng số 20/30/50, mốc 1 xong, mốc 2 đạt 50% → thực tế 35%. (2) Gia hạn được duyệt → có kế hoạch gốc v2, độ trễ so với v1 vẫn hiển thị. (3) Thành viên không phụ trách mốc không cập nhật được mốc đó. (4) Chuyên viên ghi đè mức; khi mức hệ thống đổi, giao diện báo cần đánh giá lại. (5) "Việc của tôi" của chủ nhiệm có kỳ báo cáo sắp đến hạn; của chuyên viên có báo cáo chờ xét. |
| 2 | Đầu việc, giao việc, nhắc việc, leo thang, email tuần | Nhắc đúng mốc thời gian, không gửi trùng khi chạy lại; tỷ lệ việc đúng hạn theo người, đề tài, đơn vị. |
| 3 | Gantt, đường cong S, sản phẩm, giải ngân theo mốc, xu hướng, xuất báo cáo | Báo cáo xuất ra khớp số liệu màn hình; giải ngân bị chặn khi mốc chưa được chấp nhận. |

---

## 10. Kiểm thử

- `tests/project-progress.test.mjs`: công thức (trọng số, chia đều, rải kế hoạch, SPI, ngưỡng, ghi đè hết hiệu lực).
- `tests/project-execution-capability.test.mjs`: quyền `project.progress.update`, `project.health.assess`.
- `tests/approved-projects-db.test.mjs` (PostgreSQL thật): kế hoạch gốc v1/v2, cập nhật tiến độ đúng người,
  đánh giá sức khoẻ, "Việc của tôi".
- Migration được chạy thử trên PostgreSQL 16 với dữ liệu cũ (điền ngược kế hoạch gốc).

## 11. Việc cần quyết định

1. Ngưỡng Đỏ/Vàng có cần khác nhau theo cấp đề tài (Học viện, Bộ, Nhà nước) không.
2. Mở quyền chỉ đọc tiến độ cho vai trò Giám sát.
3. Mẫu "Báo cáo tình hình thực hiện" chính thức của Phòng KHQS cho Đợt 3.
