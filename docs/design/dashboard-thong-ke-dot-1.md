# Dashboard thống kê nâng cao & drill-down — Đợt 1: nền dữ liệu và API

Đợt 1 của kế hoạch "Triển khai Dashboard Thống kê Nâng cao & Drill-down". Phạm vi: dữ liệu và API. Giao diện
(bộ lọc chung, biểu đồ, bản đồ nhiệt, Gantt, đường cong S) thuộc Đợt 2; xuất Excel danh sách chi tiết, mẫu
"Báo cáo tình hình thực hiện NCKH" và tối ưu hiệu năng thuộc Đợt 3.

## 1. Nguyên tắc phân quyền

Mọi con số và mọi dòng chi tiết đều dựng từ **đúng tập dữ liệu người xem đã đọc được ở màn hình danh sách**:

| Dữ liệu | Nguồn | Quy tắc |
|---|---|---|
| Hồ sơ đề xuất | `DashboardService.findReadableProposals` | `canReadProposal` — giống danh sách hồ sơ và `/dashboard/stats` |
| Đề tài | `ApprovedProjectsService.listProjects` | capability `project.read`; lãnh đạo toàn Học viện, vai trò khác theo phạm vi đơn vị hoặc quan hệ với đề tài |
| Kinh phí đề tài | `finance` trong bản trả về của danh sách | chỉ cộng khi capability có `project.finance.read` |
| Sản phẩm đầu ra của hồ sơ | giao của `canReadProposal` và `canReadProposalDeliverables` | cùng hàm với màn hình sản phẩm đầu ra |
| Ảnh chụp sức khoẻ | bảng `project_health_snapshots` | chỉ tính ảnh chụp của đề tài người xem đọc được **hôm nay** (không dựa vào đơn vị lưu trong ảnh chụp) |

Hệ quả:

- Bộ lọc (`unitId`, `level`, …) chỉ **thu hẹp** tập dữ liệu, không bao giờ mở rộng. Chuyên viên đơn vị A lọc
  `unitId=B` nhận danh sách rỗng, không phải 403 (không tiết lộ đơn vị B có gì hay không).
- Người dùng không xác định: 403. Người không có phạm vi và không tham gia đề tài nào: mọi số bằng 0.
- Tham số kiểm tra theo **danh sách trắng**: khoá lạ, giá trị lặp (`?unitId=a&unitId=b`), giá trị dạng đối
  tượng, định dạng sai → 400 `DASHBOARD_QUERY_INVALID` kèm `field`. Bộ lọc gõ sai không được âm thầm trả về
  toàn bộ dữ liệu.
- Dòng drill-down chỉ chứa các trường liệt kê ở mục 4 — không có thành viên, báo cáo, lịch sử, capability.
- Đề tài có phân công chuyên viên mâu thuẫn (409 `CONTEXT_AMBIGUOUS`) bị bỏ qua thay vì làm hỏng cả dashboard
  (như "Việc của tôi").
- Giữ nguyên quy tắc hiện có: lãnh đạo xem mọi **đề tài**, nhưng chỉ xem **hồ sơ** của đơn vị có trong phạm vi
  (theo `canReadProposal`). Đợt này không đổi quy tắc đó.

## 2. Ảnh chụp sức khoẻ đề tài hằng tuần

Bảng `project_health_snapshots` (migration `20261011000000_project_health_snapshots`), mỗi đề tài một dòng
mỗi ngày chụp:

| Cột | Ý nghĩa |
|---|---|
| `snapshot_date` | ngày lịch ở Việt Nam lúc chụp (DATE) |
| `project_id`, `host_organization_unit_id`, `status`, `level`, `research_field_code` | đề tài lúc chụp |
| `health_level`, `computed_level`, `health_source` | mức hiệu lực (đánh giá của chuyên viên nếu còn khớp), mức tính tự động, nguồn (`computed` / `assessment` / `not_applicable`) |
| `planned_percent`, `actual_percent`, `spi`, `max_days_overdue`, `overdue_milestones`, `late_reports` | chỉ số tiến độ — cùng công thức với màn hình tiến độ (`summarizeProjectProgress`) |
| `total_budget`, `total_disbursed`, `total_settled` | kinh phí lúc chụp (NULL nếu chưa có) |

- Ràng buộc: unique `(project_id, snapshot_date)`; mức sức khoẻ, nguồn, phần trăm 0–100, SPI ≥ 0, số đếm ≥ 0,
  tiền ≥ 0; khoá ngoại RESTRICT. Ảnh chụp **chỉ ghi thêm**: trigger chặn UPDATE.
- Không ràng buộc danh sách trạng thái đề tài trong bảng này để thêm trạng thái mới không làm hỏng tác vụ chụp.
- Tác vụ `ProjectHealthSnapshotService` chạy 23:55 hằng ngày (giờ Việt Nam) nhưng chỉ ghi khi đến hạn: **tối
  Chủ nhật**, hoặc chụp bù khi lần chụp gần nhất đã cũ hơn 7 ngày (máy chủ tắt đúng tối Chủ nhật, lần triển khai
  đầu tiên). Đề tài được duyệt theo lô 200, bỏ qua đề tài đã có ảnh trong ngày và chèn với `skipDuplicates`:
  chạy lại hay chạy song song trên nhiều bản API đều không ghi trùng. Tắt bằng `HEALTH_SNAPSHOTS_ENABLED=false`.
- Số ngày trễ, số mốc trễ, số kỳ báo cáo trễ chỉ tính cho đề tài **đang thực hiện / tạm dừng**: nghiệm thu không
  đóng mốc và kỳ báo cáo, nên đề tài đã nghiệm thu không được "trễ" mãi (cùng quy tắc ở drill-down).
- Không thể dựng lại lịch sử trước khi triển khai. Để biểu đồ có số ngay từ đầu, API xu hướng thêm một **điểm
  hiện tại** tính trực tiếp (`live: true`).

## 3. API

Tất cả là `GET`, cần đăng nhập (`SessionAuthGuard`), tiền tố `/api/v1/dashboard`.

### 3.1 `GET /trends`

Tham số: `from`, `to` (YYYY-MM-DD, mặc định 26 tuần gần nhất, tối đa 3 năm), `unitId`, `level`, `field`.

```json
{ "from": "2026-04-12", "to": "2026-10-11", "filters": {},
  "series": [ { "date": "2026-10-04", "live": false, "total": 42,
                "health": { "green": 30, "amber": 6, "red": 3, "none": 3 },
                "status": { "executing": 39, "accepted": 3 },
                "averageSpi": 0.93, "averagePlannedPercent": 51.2, "averageActualPercent": 47.9,
                "projectsWithOverdueMilestones": 5, "lateReports": 4,
                "totalBudget": 8100000000, "totalDisbursed": 3500000000 } ] }
```

Bình quân SPI và tiến độ chỉ tính đề tài thuộc diện đánh giá sức khoẻ (đang thực hiện, tạm dừng). Điểm hiện
tại chỉ có khi khoảng `from`–`to` chứa hôm nay.

### 3.2 `GET /distribution`

Tham số: `subject=projects|proposals` (bắt buộc), `unitId`, `level`, `field`, `year`, `status`.

- `projects`: `totals` (số đề tài, số đề tài được xem kinh phí, tổng kinh phí / đã giải ngân / đã quyết toán, số
  quá hạn), `byUnit`, `byLevel`, `byField` (kèm `totalBudget`, `totalDisbursed`), `byStatus`, `byHealth`,
  `byUnitHealth` (mỗi đơn vị kèm số đề tài `green` / `amber` / `red` / `none` — cho bản đồ nhiệt ở Đợt 2),
  `byYear` (năm bắt đầu).
  `year` = năm bắt đầu (giờ Việt Nam).
- `proposals`: `totals` (số hồ sơ, chờ xử lý, đã duyệt, quá hạn, kinh phí đã duyệt), `byUnit`, `byLevel`,
  `byField` (kèm `approvedBudget`), `byStatus`, `byYear`. `year` = năm nộp (chưa nộp: năm tạo).

Mỗi nhóm là `{ key, label, count, … }`; khoá rỗng nghĩa là "Chưa phân loại".

### 3.3 `GET /products`

Tham số: `unitId`, `level`, `field`, `year`.

- `projectProducts`: tổng, theo trạng thái (`PLANNED`, `SUBMITTED`, `UNDER_REVIEW`, `PASSED`, `FAILED`) và theo
  dạng 1–6 (luôn đủ 6 dòng).
- `proposalDeliverables`: tổng, theo loại (Bài báo khoa học, Bằng sáng chế, …) và trạng thái.

### 3.4 `GET /drill-down`

Tham số: `metric` (bắt buộc), `page` (≥1), `pageSize` (1–200, mặc định 50) và bộ lọc **theo metric** — truyền
bộ lọc không thuộc metric là 400:

| metric | Bộ lọc | Sắp xếp | Trường mỗi dòng |
|---|---|---|---|
| `projects` | `unitId level field year status health overdue` | trễ nhiều nhất, Đỏ → Vàng → Xanh, mã | `id code title unit piName status level field health spi plannedPercent actualPercent daysOverdue lateReports overdue startDate endDate totalBudget totalDisbursed link` |
| `proposals` | `unitId level field year status overdue` | mới nộp trước | `id code title unit ownerName status level field submittedAt endDate overdue link` |
| `products` | `unitId level field year form productStatus` | mã đề tài, thứ tự nội dung | `id title productForm status position project unit link` |
| `deliverables` | `unitId level field year type deliverableStatus` | mã hồ sơ | `id type title status publishedAt proposal unit link` |

`health` nhận `green|amber|red|none`; `overdue` nhận `true|false`. Kết quả: `{ metric, filters, total, page,
pageSize, items }`. `totalBudget` / `totalDisbursed` là `null` khi người xem không có quyền xem kinh phí đề tài.

Ví dụ: đề tài Đỏ của đơn vị X — `/api/v1/dashboard/drill-down?metric=projects&unitId=X&health=red`.

## 4. Kiểm thử

- `tests/dashboard-analytics.test.mjs`: danh sách trắng tham số; 403 khi không xác định người dùng; chuyên viên
  đơn vị 1 lọc sang đơn vị 2 / mức Đỏ không thấy gì; người ngoài thấy 0 ở mọi metric; chủ nhiệm chỉ thấy của
  mình; trường của dòng drill-down đúng danh sách; sản phẩm đầu ra là giao hai quyền (thành viên đọc được hồ sơ
  nhưng không thấy sản phẩm đầu ra); xu hướng chỉ tính ảnh chụp của đề tài đọc được; chụp lại cùng ngày không
  trùng; biến môi trường tắt tác vụ.
- Kiểm thử đột biến: bỏ lọc quyền đề tài, bỏ giao quyền sản phẩm đầu ra, bỏ lọc ảnh chụp theo quyền — mỗi
  đột biến làm ít nhất một test thất bại.
- Migration chạy trên PostgreSQL 16 cùng toàn bộ migration trước; kiểm tra unique, các ràng buộc CHECK, khoá
  ngoại và trigger chỉ ghi thêm.

## 5. Giới hạn đã biết (để Đợt 3)

- Mỗi lần gọi API tải toàn bộ đề tài người xem đọc được qua `listProjects` (kèm đầy đủ quan hệ) rồi tính trong
  bộ nhớ — đúng phân quyền nhưng chưa tối ưu. Đợt 3 sẽ chuyển sang truy vấn tổng hợp và đo mục tiêu < 500 ms.
- Phân trang drill-down làm trong bộ nhớ sau khi lọc quyền.
- Mã lĩnh vực / cấp trả về dạng mã; nhãn hiển thị do giao diện (Đợt 2) ánh xạ từ danh mục.
