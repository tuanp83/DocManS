# Nghiệm thu, thanh lý, đóng đề tài; kinh phí gắn với đề tài; thông báo sự kiện

Phạm vi: giai đoạn cuối vòng đời đề tài (sau khi thực hiện), kinh phí/giải ngân chuyển từ hồ sơ đề xuất
sang đề tài thực hiện, và thông báo (trong ứng dụng + email) cho các sự kiện chính.

Mã nguồn chính:

- `apps/api/src/approved-projects/project-closure.service.ts`: nghiệm thu, kinh phí, thanh lý, đóng.
- `apps/api/src/approved-projects/project-capability-v1.ts`: quyền (một nguồn cho cả máy chủ và giao diện).
- `apps/api/src/notifications/*`: phát thông báo, nhắc hạn hằng ngày.
- Migration `20261010060000_project_closure_finance_notifications`.
- Giao diện: `components/projects/project-closure-panel.tsx`, `milestone-disbursement-modal.tsx`.

## 1. Vòng đời đề tài

```
executing ──(chủ nhiệm nộp hồ sơ nghiệm thu)──▶ pending_acceptance
    ▲                                              │
    └────────(chuyên viên trả hồ sơ)───────────────┤
                                                   ├─(biên bản: đạt / xác nhận bản hoàn thiện)─▶ accepted ─┐
                                                   └─(biên bản: không đạt)─────────────────────▶ failed ───┤
                                                                                                           ▼
                                                       thanh lý (chuyên viên lập → lãnh đạo phê duyệt) → closed
```

### 1.1. Vòng nghiệm thu (`project_acceptances`)

| Trạng thái | Ai chuyển | Điều kiện |
|---|---|---|
| `SUBMITTED` | Chủ nhiệm (`project.acceptance.submit`) | Đề tài đang thực hiện; mọi mốc đã hoàn thành; không còn yêu cầu điều chỉnh/gia hạn hay báo cáo đang chờ xử lý; có ít nhất một tệp hồ sơ thuộc đề tài. |
| `RETURNED` | Chuyên viên phụ trách (`return`) | Từ `SUBMITTED`, bắt buộc lý do; đề tài quay về `executing`; vòng này đóng lại, lần nộp sau là vòng mới. |
| `COUNCIL_PROPOSED` | Chuyên viên phụ trách (`council.propose`) | 3–15 thành viên, đúng 1 Chủ tịch, 1 Thư ký, ≥1 phản biện; chủ nhiệm và thành viên đề tài (kể cả đã kết thúc) bị chặn. Sửa lại được khi chưa thành lập. |
| `COUNCIL_ESTABLISHED` | Lãnh đạo (`council.establish`) | Số quyết định nhập tay (kiểm tra trùng) hoặc hệ thống cấp `NNN/QĐ-HVQY-NT/YYYY` (dùng chung bộ đếm với luồng cũ). |
| `PASSED` / `FAILED` / `REVISION_REQUIRED` | Chuyên viên phụ trách (`minutes.record`) | Điểm 4 tiêu chí bắt buộc (30/30/15/25); dưới 70 điểm không được kết luận "đạt". |
| `REVISION_SUBMITTED` | Chủ nhiệm (`revision.submit`) | Có nội dung và tệp bản hoàn thiện. |
| `PASSED` hoặc lại `REVISION_REQUIRED` | Chuyên viên phụ trách (`revision.confirm`) | Yêu cầu hoàn thiện tiếp phải có ý kiến. |

Ràng buộc trong CSDL: tối đa một vòng đang mở cho mỗi đề tài (chỉ mục duy nhất có điều kiện); vòng đã
kết luận (`PASSED`, `FAILED`, `RETURNED`) không sửa, không xoá (trigger); tệp đã nộp trong hồ sơ nghiệm
thu bị khoá như minh chứng báo cáo.

### 1.2. Thanh lý (`project_liquidations`)

- Chuyên viên phụ trách lập/sửa dự thảo khi đề tài `accepted` hoặc `failed`: ngày thanh lý, số tiền thu
  hồi, sản phẩm bàn giao, tệp biên bản. Số liệu kinh phí được chụp lại từ mục Kinh phí.
- Lãnh đạo phê duyệt: số liệu được chốt lại theo kinh phí hiện tại và **phải cân đối**
  `đã quyết toán + thu hồi = đã giải ngân` (kiểm tra ở máy chủ và bằng CHECK trong CSDL). Số biên bản
  nhập tay hoặc hệ thống cấp `NNN/BBTL-HVQY/YYYY`.
- Biên bản đã phê duyệt không sửa, không xoá; tệp kèm theo bị khoá; kinh phí đề tài chuyển sang chỉ xem.
- Đề tài không đạt vẫn phải thanh lý (thu hồi kinh phí) trước khi đóng.

### 1.3. Đóng đề tài

Chuyên viên phụ trách đóng khi thanh lý đã được phê duyệt và không còn yêu cầu đang xử lý. Ghi
`closed_at`, `closed_by_id`, ghi chú; CHECK bảo đảm trạng thái `closed` luôn có ngày đóng. Sau khi đóng,
mọi thao tác ghi bị chặn bởi capability.

## 2. Kinh phí gắn với đề tài

Trước đây: JSON `research_proposals.disbursement_metadata` trên hồ sơ đề xuất, ghi đè cả khối.

Nay:

- `project_finances`: kinh phí được duyệt, tổng đã giải ngân / đã quyết toán (máy chủ tự tính),
  trạng thái quyết toán, `version` để chống ghi đè đồng thời (gửi `financeVersion` khi lưu).
- `project_disbursements`: từng đợt giải ngân, có thể gắn với một mốc thực hiện (`project_milestone_id`).
- `project_cost_items`: khoản chi (phân bổ / đã chi / đã quyết toán ≤ đã chi).
- Kinh phí được duyệt: số lãnh đạo phê duyệt (`budgetMetadata.approvedAmount`), nếu không có thì số
  đề xuất; không còn số mặc định 500 triệu.
- Chứng từ: tệp của đề tài, mục đích `disbursement_voucher`; khi lưu, máy chủ kiểm tra tệp đúng đề tài,
  đúng mục đích, còn hoạt động và lấy tên tệp từ CSDL.
- Quyền (`project.finance.manage`): lãnh đạo hoặc cán bộ QLKH có phạm vi đơn vị chủ trì, không tham gia
  đề tài — như quy định cũ; bị khoá khi đề tài đã đóng hoặc thanh lý đã duyệt. Chủ nhiệm và thành viên
  xem (`project.finance.read`).

API cũ `/research-proposals/:id/disbursement` và `/acceptance-council/*` đã bỏ; dùng
`/projects/:id/finance`, `/projects/:id/acceptance/*`, `/projects/:id/liquidation*`, `/projects/:id/close`.

### Chuyển dữ liệu cũ

Hàm SQL `import_legacy_project_closure(project_id)` (dùng chung cho migration và lúc tạo đề tài mới):

- Kinh phí, đợt, khoản chi từ JSON cũ; giá trị hỏng (chữ, số âm, ngày sai, trạng thái lạ) được đưa về
  giá trị an toàn; chứng từ đã tải theo hồ sơ chuyển sang đề tài.
- Hội đồng nghiệm thu cũ → vòng 1 (`legacy_source` ghi nguồn): `PROPOSED → COUNCIL_PROPOSED`,
  `ESTABLISHED → COUNCIL_ESTABLISHED`, `EVALUATED` theo kết luận → `PASSED` / `FAILED` / `REVISION_REQUIRED`.
  Đề tài đang thực hiện/tạm dừng được chuyển trạng thái tương ứng và ghi lịch sử `project.acceptance.backfill`.
- Chạy lại an toàn (bỏ qua nếu đề tài đã có dữ liệu). Đề xuất có dữ liệu cũ nhưng chưa lập đề tài: dữ liệu
  được chuyển khi tạo đề tài; migration in NOTICE số lượng.
- Danh sách đề xuất (trang Báo cáo) vẫn nhận `disbursementMetadata` / `acceptanceCouncilMetadata` nhưng lấy
  từ đề tài khi đã có đề tài, kèm `project: { id, status }`.

## 3. Thông báo

Mọi thông báo được phát **sau khi giao dịch nghiệp vụ commit**; lỗi ghi thông báo hoặc gửi email không
làm hỏng thao tác. Người nhận không hoạt động bị bỏ qua; người thực hiện thao tác không tự nhận thông báo.
Email: tiêu đề/nội dung được thoát HTML, liên kết tuyệt đối theo `APP_BASE_URL` (mặc định gốc của
`ACCOUNT_LOGIN_URL`), chỉ cho phép đường dẫn nội bộ; gửi nền qua SMTP cấu hình (`mail/mail.service.ts`).

| Sự kiện | Người nhận |
|---|---|
| Nộp hồ sơ đề xuất / nộp lại sau bổ sung | Cán bộ QLKH có phạm vi đơn vị chủ trì; biên nhận cho chủ nhiệm |
| Yêu cầu bổ sung hồ sơ đề xuất | Chủ nhiệm (kèm lý do, hạn) |
| Mời phản biện / thành viên hội đồng (phân công lẻ hoặc khi lãnh đạo duyệt hội đồng) | Người được phân công |
| Lãnh đạo phê duyệt / không phê duyệt | Chủ nhiệm, thành viên; khi phê duyệt: cán bộ QLKH (để lập đề tài) |
| Báo cáo tiến độ được nộp | Chuyên viên phụ trách |
| Yêu cầu bổ sung báo cáo / yêu cầu điều chỉnh, gia hạn | Chủ nhiệm |
| Đề nghị gia hạn đã thẩm định, chờ quyết định | Lãnh đạo |
| Quyết định điều chỉnh / gia hạn | Chủ nhiệm |
| Nộp hồ sơ nghiệm thu, bản hoàn thiện | Chuyên viên phụ trách (chưa có thì cán bộ QLKH trong phạm vi) |
| Trả hồ sơ nghiệm thu | Chủ nhiệm |
| Đề xuất hội đồng nghiệm thu, dự thảo thanh lý | Lãnh đạo |
| Thành lập hội đồng nghiệm thu | Chủ nhiệm, chuyên viên; mời từng thành viên hội đồng có tài khoản |
| Kết quả nghiệm thu, đóng đề tài | Chủ nhiệm, thành viên |
| Phê duyệt thanh lý | Chủ nhiệm, chuyên viên |
| Cập nhật giải ngân | Chủ nhiệm |

### Nhắc hạn (07:00 hằng ngày, giờ Việt Nam)

`DeadlineReminderService` (tắt bằng `DEADLINE_REMINDERS_ENABLED=false`):

- Kỳ báo cáo đang mở chưa có báo cáo đã nộp: nhắc chủ nhiệm khi còn ≤ 7, ≤ 3, ≤ 1 ngày (kể cả ngày đến hạn);
  quá hạn: nhắc chủ nhiệm và chuyên viên mỗi tuần một lần.
- Hạn bổ sung báo cáo, yêu cầu điều chỉnh/gia hạn, hồ sơ đề xuất: nhắc theo cùng các nấc.
- Đề tài sắp hết thời gian thực hiện (≤ 30 và ≤ 7 ngày): nhắc chủ nhiệm và chuyên viên chuẩn bị nghiệm thu
  (khoá theo ngày kết thúc nên gia hạn sẽ nhắc lại theo hạn mới).

Chống gửi trùng: cột `user_notifications.dedup_key` + chỉ mục duy nhất `(user_id, dedup_key)`; chạy lại trong
ngày hoặc chạy trên nhiều bản API không tạo thông báo lặp.
