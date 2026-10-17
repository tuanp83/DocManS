# Thiết kế: Quản lý Hội nghị Khoa học

Phạm vi: module lớn mới, ngang hàng với **Đề xuất đề tài** (`research-proposals`, `proposal-intake-periods`).
Tài liệu mô tả 3 đợt; **Đợt 1 và Đợt 2 đã hiện thực** (module `apps/api/src/conferences`, trang `/conferences`, `/my-conferences`, `/conference-invitation`). Đợt 3 chưa làm. Các quyết định nghiệp vụ đã chốt ở mục 11.

Đáp ứng thuyết minh: 2.6 ("quản lý văn bản liên quan đề tài, hội nghị theo thời gian thực"), 2.5 (dashboard, báo cáo).

---

## 1. Luồng nghiệp vụ

1. **Trưởng phòng KHQS tạo hội nghị**: tên, cấp, đơn vị chủ trì, thời gian tổ chức, địa điểm, hạn nộp tóm tắt,
   hạn nộp toàn văn.
2. **Trưởng phòng giao chuyên viên phụ trách.** Mỗi hội nghị có một chuyên viên phụ trách chính; giao lại hoặc
   thu hồi đều giữ lịch sử.
3. **Chuyên viên lập danh sách khách mời** gồm **báo cáo viên** và **đại biểu**: chọn nhà khoa học đã có tài khoản,
   hoặc nhập họ tên, đơn vị, email (nhập tay hoặc từ Excel).
4. **Chuyên viên gửi thư mời** ghi thời gian tổ chức và địa điểm (với báo cáo viên, ghi thêm hạn nộp). Thư có nút
   **Nhận lời** và **Từ chối**.
   - Người đã có tài khoản: nhận thông báo trong hệ thống và email, bấm nhận lời trong hệ thống.
   - Người chưa có tài khoản: bấm **Nhận lời** trong email thì **hệ thống tạo tài khoản** và chuyển tới trang đặt mật khẩu.
     Người trong Học viện được tạo tài khoản nội bộ theo đơn vị chuyên viên đã chọn khi thêm khách mời; người ngoài
     Học viện được tạo tài khoản ngoài. Từ chối không tạo tài khoản.
5. **Báo cáo viên nộp tóm tắt và toàn văn bất cứ lúc nào trước hạn**, không chờ chuyên viên chấp nhận tóm tắt. Chuyên
   viên xem bài, có thể **yêu cầu sửa** kèm lý do; báo cáo viên nộp lại. Chuyên viên theo dõi ai đã nộp, ai chưa, và gửi thư nhắc.
6. **Đóng nhận bài, lập chương trình chi tiết.** Trưởng các tiểu ban gửi danh sách báo cáo của tiểu ban mình cho chuyên
   viên (ngoài hệ thống). Chuyên viên nhập vào hệ thống: **phiên toàn thể** (mọi người cùng dự, không có phiên nào chạy
   song song) và **các tiểu ban** (chạy song song với nhau, sau phiên toàn thể), báo cáo thuộc từng phiên, khung giờ,
   **thời lượng tối đa mỗi báo cáo**. **Hệ thống tự xếp lịch**; chuyên viên chỉnh lại nếu cần rồi chốt.
7. **Gửi chương trình chi tiết** cho toàn bộ khách mời đã nhận lời.
8. **Gửi kỷ yếu**: chuyên viên biên soạn kỷ yếu bên ngoài, tải tệp hoàn chỉnh lên, hệ thống gửi cho khách mời.
9. **Kết thúc hội nghị.** Hồ sơ hội nghị được lưu lại.

---

## 2. Đối chiếu với module Đề xuất đề tài

| Đề xuất đề tài (đã có) | Hội nghị khoa học (mới) |
| --- | --- |
| `ProposalIntakePeriod` | `ScientificConference` |
| `ProposalManagementOfficer` (một chuyên viên chính, có lịch sử) | `ConferenceOfficer`: cách giao, giao lại, thu hồi giống hệt |
| Không có (hồ sơ do người dùng tự tạo) | `ConferenceInvitation`: chỉ báo cáo viên đã nhận lời mới nộp được |
| `ResearchProposal` + `submission-evidence.ts` (bản nộp bất biến) | `ConferencePaper` + `ConferencePaperVersion` (tóm tắt, toàn văn) |
| `ProposalSupplementRequest` (yêu cầu bổ sung, nộp lại) | Yêu cầu sửa bài, nộp lại |
| `ProposalSubmissionEvent` / `StudentResearchEvent` | `ConferenceEvent` (lịch sử thao tác) |
| `AccountActivationToken`, `AccountCredentialDelivery` | Dùng lại để tạo tài khoản khi người được mời nhận lời |
| `notifications`, `mail`, `NotificationTemplate` | Dùng lại để gửi thư mời, thư nhắc, chương trình, kỷ yếu |
| Bộ xuất Excel / Word (commit `425d7e5`) | Xuất danh sách khách mời, tình trạng nộp bài, chương trình chi tiết |

---

## 3. Nguyên tắc thiết kế

1. **Chỉ Trưởng phòng tạo hội nghị và giao chuyên viên.** Quyền xử lý của chuyên viên chỉ có hiệu lực trên hội nghị
   được giao (assignment gắn với bản ghi, theo `CONTEXT.md`).
2. **Nộp bài theo lời mời.** Quyền nộp gắn với lời mời báo cáo viên đã được nhận lời, không gắn với vai trò hệ thống.
3. **Tài khoản tạo khi nhận lời có quyền tối thiểu**:
   - Người trong Học viện: `RESEARCHER_INTERNAL_USER`, đơn vị do **chuyên viên chọn khi thêm khách mời** (người được mời
     không tự chọn, vì đơn vị quyết định phạm vi quản lý về sau).
   - Người ngoài Học viện: `EXTERNAL_RESEARCHER_USER`, không có quyền gì ngoài các hội nghị mình được mời (đúng định
     nghĩa vai trò này trong `CONTEXT.md`).
4. **Đường link trong thư là mã dùng một lần**: lưu bản băm, có hạn dùng, gắn với một lời mời; dùng xong hoặc hết hạn
   thì vô hiệu. Đường link không thay cho đăng nhập khi nộp bài.
5. **Chuyển trạng thái tường minh**: một bảng trạng thái (`conference-workflow.ts`) theo mẫu `proposal-workflow.ts`;
   mọi thao tác ghi đều có audit và lý do khi cần.
6. **Bản nộp bất biến**: nộp lại tạo phiên bản mới, không ghi đè bản cũ.
7. **Thư đã gửi là bằng chứng**: lưu nội dung, tệp đính kèm, người nhận và kết quả gửi của từng đợt thư.
8. **Xếp lịch là hàm thuần, có test** (`conference-scheduling.ts`): cùng đầu vào cho cùng kết quả; chỉnh tay sau khi
   xếp được lưu riêng, không bị xếp lại đè mất nếu chuyên viên không yêu cầu.

---

## 4. Vòng đời

### 4.1 Hội nghị (`ScientificConference.status`)

```
draft ──Trưởng phòng giao chuyên viên──> preparing
preparing ──gửi thư mời đầu tiên──> inviting                (đang mời, đang nhận bài)
inviting ──hết hạn toàn văn / đóng tay──> submission_closed
submission_closed ──chốt và gửi chương trình chi tiết──> program_published
program_published ──sau ngày tổ chức, chuyên viên kết thúc──> completed
(mọi trạng thái trước completed) ──huỷ, có lý do──> cancelled
```

Kỷ yếu có thể gửi ở `program_published` hoặc `completed` (thường phát tại hoặc sau hội nghị).
Đổi thời gian hoặc địa điểm sau khi đã gửi thư mời: cho phép, ghi lịch sử, gợi ý gửi thư thông báo thay đổi.

### 4.2 Lời mời (`ConferenceInvitation.status`)

```
draft ──gửi──> sent ──nhận lời──> accepted      (tạo tài khoản nếu chưa có)
                    ──từ chối──> declined
draft / sent / accepted ──chuyên viên huỷ lời mời, có lý do──> revoked
sent ──quá hạn mà chưa trả lời──> (vẫn là sent; chỉ gắn cờ, chuyên viên quyết định nhắc hay huỷ)
```

Chuyên viên có thể gửi lại thư mời (tạo mã mới, mã cũ vô hiệu).

### 4.3 Báo cáo tham luận (`ConferencePaper.status`)

Báo cáo được tạo khi báo cáo viên nhận lời.

```
awaiting_abstract ──nộp tóm tắt──> abstract_submitted ──nộp toàn văn──> full_paper_submitted
full_paper_submitted ──xếp vào chương trình──> scheduled
(trước scheduled) ──tác giả rút / chuyên viên huỷ, có lý do──> withdrawn
```

- **Không có bước chấp nhận tóm tắt.** Nộp toàn văn được ngay sau khi nộp tóm tắt (có thể nộp cả hai cùng lúc),
  miễn còn trước hạn nộp toàn văn.
- **Trước hạn**, báo cáo viên được tự nộp bản mới bao nhiêu lần cũng được; mỗi lần là một phiên bản mới.
- **Yêu cầu sửa** ghi riêng cho tóm tắt hoặc toàn văn (`conference_revision_requests`), có hạn nộp lại riêng. Trong lúc
  chờ sửa, báo cáo gắn cờ "đang chờ sửa" chứ không đổi trạng thái, nên không chặn việc nộp phần còn lại.
- **Sau hạn**, chỉ nộp được khi đang có yêu cầu sửa còn hạn.

---

## 5. Tác nhân và quyền

| Tác nhân | Cách xác định | Được làm |
| --- | --- | --- |
| Trưởng phòng KHQS (`RESEARCH_MANAGEMENT_HEAD`) | Vai trò hệ thống + phạm vi đơn vị | Tạo, sửa, huỷ hội nghị; giao, giao lại, thu hồi chuyên viên; xem toàn bộ |
| Chuyên viên phụ trách | `ConferenceOfficer` còn hiệu lực | Khách mời, gửi thư, yêu cầu sửa bài, tiểu ban, xếp lịch, chương trình, kỷ yếu, kết thúc |
| Chuyên viên khác | Vai trò hệ thống | Không xử lý hội nghị không được giao |
| Lãnh đạo (`LEADERSHIP_APPROVAL_AUTHORITY`, `SCIENCE_DEPUTY_DIRECTOR`) | Vai trò hệ thống | Xem hội nghị, thống kê |
| Báo cáo viên | Lời mời `speaker` đã nhận lời | Nộp, nộp lại, rút báo cáo của mình; xem thông tin, chương trình, kỷ yếu |
| Đại biểu | Lời mời `delegate` đã nhận lời | Xem thông tin, chương trình, kỷ yếu |

Trưởng tiểu ban không thao tác trong hệ thống; tên của họ chỉ hiện trong chương trình.

Hàm phân quyền viết thuần, có test, đặt ở `conference-access.ts` (theo mẫu `student-research-access.ts`). Giao diện
chỉ hiển thị capability; máy chủ luôn kiểm tra lại.

---

## 6. Xếp lịch tự động (Đợt 2)

**Đầu vào chuyên viên nhập:**
- **Phiên**: phiên toàn thể và từng tiểu ban. Mỗi phiên có tên, phòng, chủ toạ / trưởng tiểu ban, thư ký.
- **Khung giờ** của từng phiên: ngày, giờ bắt đầu, giờ kết thúc; các khoảng nghỉ (giải lao, ăn trưa); thời gian
  khai mạc / bế mạc nếu có.
- **Báo cáo thuộc từng phiên** theo danh sách trưởng tiểu ban gửi, kèm thứ tự ưu tiên nếu có.
- **Thời lượng tối đa mỗi báo cáo** (ví dụ 10 phút trình bày + 5 phút thảo luận). Mặc định đặt cho cả hội nghị,
  ghi đè được theo phiên.

**Cấu trúc chương trình:** phiên toàn thể diễn ra trước, mọi nhà khoa học cùng dự, không có phiên nào chạy song song;
sau đó các tiểu ban chạy song song với nhau, mỗi tiểu ban ở một phòng.

**Hệ thống làm:**
1. Giờ bắt đầu, kết thúc của từng phiên do chuyên viên nhập (không tự suy từ giờ kết thúc phiên toàn thể); hệ thống
   kiểm tra để không tiểu ban nào trùng giờ phiên toàn thể.
2. Với mỗi phiên, xếp lần lượt các báo cáo theo thứ tự vào khung giờ, bỏ qua các khoảng nghỉ. Giờ được tính lại mỗi
   lần xem, nên không cần nút "Xếp lại" riêng.
3. Báo cáo không vừa khung giờ thì đánh dấu **vượt khung**, báo số phút thiếu. Hệ thống không tự cắt thời lượng.
4. Lỗi chặn việc chốt chương trình:
   - Phiên toàn thể có phiên khác chạy cùng lúc; một ngày có hai phiên toàn thể.
   - Hai tiểu ban dùng cùng một phòng trong cùng thời gian.
   - Một báo cáo viên có báo cáo ở hai phiên trùng giờ (hiện mỗi báo cáo viên chỉ có một báo cáo trong một hội nghị,
     nên lỗi này chỉ là lớp bảo vệ).
   - Báo cáo vượt khung; giờ đặt tay nằm ngoài phiên hoặc chồng lên giải lao, báo cáo khác.
   Còn báo cáo đã nộp toàn văn mà chưa được xếp: không chặn, nhưng phải xác nhận khi chốt.
5. Chuyên viên đổi thứ tự (lên/xuống), chuyển báo cáo sang phiên khác, bỏ khỏi phiên, đặt giờ tay cho từng báo cáo
   (giữ nguyên khi tính lại) hoặc bỏ đặt tay.
6. Chốt chương trình tạo một bản bất biến; báo cáo trong chương trình chuyển "đã xếp lịch", hội nghị chuyển "đã gửi
   chương trình". Sửa sau khi chốt thì hệ thống báo cần chốt lại; chốt lại tạo bản mới. Bản Word xuất trên trình
   duyệt từ bản đã chốt. Gửi chương trình và gửi kỷ yếu là thư cho khách mời đã nhận lời; khách mời xem chương trình,
   tải bản Word và kỷ yếu ở mục Hội nghị của tôi.

---

## 7. Mô hình dữ liệu

### Đợt 1

| Bảng | Nội dung chính |
| --- | --- |
| `scientific_conferences` | `code` (cấp từ `DocumentNumberCounter`), tên, cấp hội nghị (`CatalogItem`), đơn vị chủ trì, mô tả, địa điểm, `startsAt`, `endsAt`, `abstractDeadline`, `fullPaperDeadline`, `responseDeadline`, trạng thái, `createdById` |
| `conference_officers` | `conferenceId`, `userId`, `assignedById`, `assignedAt`, `revokedAt`, lý do; tối đa một người còn hiệu lực |
| `conference_invitations` | `conferenceId`, loại (`speaker` / `delegate`), `userId?` (có sẵn hoặc tạo khi nhận lời), họ tên, học hàm học vị, email, `isInternal`, `organizationUnitId` (bắt buộc khi `isInternal`), tên đơn vị ngoài (khi không phải người trong Học viện), trạng thái, `sentAt`, `respondedAt`, lý do từ chối |
| `conference_invitation_tokens` | Bản băm mã, `invitationId`, `expiresAt`, `usedAt`, `revokedAt` |
| `conference_mailings` | Đợt thư: loại (`invitation`, `reminder`, `change_notice`, `program`, `proceedings`), tiêu đề, nội dung, tệp đính kèm, người gửi, thời điểm |
| `conference_mailing_recipients` | Người nhận của từng đợt thư, kênh (hệ thống / email), kết quả gửi, lỗi; gửi lại được cho người lỗi |
| `conference_papers` | `conferenceId`, `invitationId`, `ownerId`, tiêu đề, danh sách tác giả (JSON: thứ tự, họ tên, đơn vị, tác giả liên hệ), trạng thái |
| `conference_paper_versions` | Loại (`abstract` / `full_paper`), số phiên bản, nội dung tóm tắt, tệp (`FileRecord`), người nộp, thời điểm |
| `conference_revision_requests` | `paperId`, loại (`abstract` / `full_paper`), lý do, hạn nộp lại, người yêu cầu, thời điểm, phiên bản trả lời |
| `conference_events` | Lịch sử: `conferenceId`, `paperId?`, `invitationId?`, người thực hiện, action, from/to status, lý do, facts |

Nếu email người được mời trùng với tài khoản đã có, gắn lời mời vào tài khoản đó thay vì tạo tài khoản mới.

### Đợt 2

| Bảng | Nội dung |
| --- | --- |
| `conference_sessions` | Phiên: loại (`plenary` / `track`; mỗi hội nghị tối đa một phiên toàn thể mỗi ngày), tên, phòng, chủ toạ, thư ký, ngày, giờ bắt đầu, giờ kết thúc, thời lượng mỗi báo cáo (ghi đè), thứ tự |
| `conference_session_breaks` | Khoảng nghỉ trong phiên: giờ bắt đầu, giờ kết thúc, nhãn |
| `conference_session_slots` | `sessionId`, `paperId`, thứ tự, giờ bắt đầu, giờ kết thúc, `manuallyAdjusted` |
| `conference_program_versions` | Bản chương trình đã chốt: số phiên bản, ảnh chụp lịch (JSON), tệp Word, thời điểm, người chốt |
| `conference_proceedings` | Kỷ yếu: tệp do chuyên viên tải lên (`FileRecord`), số phiên bản, ISBN (nếu có), thời điểm, người tải |

### Đợt 3 (khi cần)

Phản biện báo cáo; điểm danh; giấy chứng nhận; giải thưởng; đưa báo cáo đã trình bày sang `ResearcherProfilePublication`
(tác giả xác nhận) và `ProjectProduct` (nếu báo cáo là kết quả của đề tài).

---

## 8. Backend (NestJS)

```
apps/api/src/conferences/
  conferences.module.ts
  conferences.controller.ts / .service.ts / .dto.ts                 hội nghị, giao chuyên viên
  conference-invitations.controller.ts / .service.ts / .dto.ts      khách mời, đợt thư, nhận lời / từ chối
  conference-papers.controller.ts / .service.ts / .dto.ts           nộp, yêu cầu sửa, nộp lại
  conference-program.controller.ts / .service.ts                    (Đợt 2) phiên, xếp lịch, chương trình, kỷ yếu
  conference-access.ts                                               hàm phân quyền thuần
  conference-workflow.ts                                             bảng trạng thái
  conference-scheduling.ts                                           (Đợt 2) hàm xếp lịch thuần
  conference-mail-templates.ts                                       mẫu thư
```

API chính (Đợt 1):

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET / POST | `/conferences` | Danh sách theo quyền; Trưởng phòng tạo |
| GET / PATCH | `/conferences/:id` | Chi tiết; sửa thông tin |
| POST | `/conferences/:id/officer` | Giao, giao lại, thu hồi chuyên viên |
| POST | `/conferences/:id/transitions` | `close-submission`, `complete`, `cancel` |
| GET / POST / PATCH | `/conferences/:id/invitations` | Khách mời: thêm, nhập từ Excel, sửa, huỷ |
| POST | `/conferences/:id/mailings` | Gửi thư mời, nhắc, thông báo thay đổi cho nhóm người nhận đã chọn |
| GET | `/conference-invitations/respond?token=` | Trang công khai: xem thư mời, nhận lời / từ chối (không cần đăng nhập) |
| POST | `/conference-invitations/respond` | Ghi nhận trả lời; nhận lời thì tạo tài khoản và trả về bước đặt mật khẩu |
| GET | `/my-conferences` | Hội nghị tôi được mời, cùng báo cáo của tôi |
| POST | `/conference-papers/:id/abstract`, `/full-paper`, `/withdraw` | Nộp, nộp lại, rút |
| POST | `/conference-papers/:id/revision-requests` | Chuyên viên yêu cầu sửa |
| GET | `/conferences/:id/papers/export.xlsx` | Tình trạng nộp bài |

Đường dẫn công khai cần giới hạn số lần gọi và không tiết lộ thông tin hội nghị khi mã sai hoặc hết hạn.

---

## 9. Giao diện (Next.js)

| Trang | Ai thấy | Nội dung |
| --- | --- | --- |
| `/conferences` | Trưởng phòng, chuyên viên, lãnh đạo | Danh sách hội nghị, lọc theo trạng thái, năm, chuyên viên phụ trách |
| `/conferences/[id]` | Theo quyền | Tab: Thông tin · Khách mời · Báo cáo · Thư đã gửi · Chương trình (Đợt 2) · Kỷ yếu (Đợt 2) · Lịch sử |
| `/conference-invitation` | Công khai, qua đường link trong thư | Nội dung thư mời, nút Nhận lời / Từ chối, đặt mật khẩu |
| `/my-conferences` | Khách mời đã nhận lời | Thời gian, địa điểm, hạn nộp, nộp tóm tắt và toàn văn, yêu cầu sửa, chương trình, kỷ yếu |

Thêm mục menu "Hội nghị khoa học" trong `apps/web/src/fixtures/shell-context.ts` cho Trưởng phòng, chuyên viên và lãnh đạo;
"Hội nghị của tôi" cho nhà nghiên cứu và `EXTERNAL_RESEARCHER_USER`. Gom mã gọi API ở `apps/web/src/lib/conferences-api.ts`.
Dùng hộp xác nhận, thông báo, nhập lý do của hệ thống (commit `f407972`).

---

## 10. Kế hoạch triển khai

### Đợt 1: Tạo hội nghị, mời, nhận bài (bước 1–5 của luồng)

1. Migration + model Đợt 1; seed danh mục cấp hội nghị, mẫu thư.
2. `conference-workflow.ts`, `conference-access.ts` kèm test thuần.
3. Trưởng phòng tạo hội nghị và giao chuyên viên.
4. Khách mời: chọn từ tài khoản, nhập tay, nhập từ Excel; gửi thư mời (hệ thống + email), lưu kết quả gửi.
5. Trang nhận lời / từ chối; khi nhận lời tạo tài khoản `RESEARCHER_INTERNAL_USER` theo đơn vị đã chọn (người trong
   Học viện) hoặc `EXTERNAL_RESEARCHER_USER` (người ngoài); gắn với tài khoản có sẵn nếu trùng email.
6. Báo cáo viên nộp tóm tắt, toàn văn bất cứ lúc nào trước hạn; chuyên viên yêu cầu sửa, báo cáo viên nộp lại; thư nhắc;
   xuất Excel tình trạng nộp.
7. Giao diện `/conferences`, chi tiết hội nghị, `/conference-invitation`, `/my-conferences`.
8. Test DB (`tests/conferences-db.test.mjs`), test mã mời (hết hạn, dùng lại, sai mã), test nguồn giao diện.

### Đợt 2: Chương trình chi tiết, kỷ yếu (bước 6–9 của luồng)

1. Đóng nhận bài; nhập phiên toàn thể, tiểu ban, khung giờ, khoảng nghỉ, thời lượng mỗi báo cáo.
2. Gán báo cáo vào phiên theo danh sách trưởng tiểu ban gửi.
3. `conference-scheduling.ts` + test; xếp phiên toàn thể trước, tiểu ban song song sau; cảnh báo vượt khung, trùng giờ,
   trùng phòng; chỉnh tay, xếp lại.
4. Chốt chương trình, xuất Word, gửi khách mời; phiên bản và thông báo thay đổi.
5. Tải kỷ yếu lên, gửi khách mời.
6. Kết thúc hội nghị (kỷ yếu vẫn tải và gửi được sau khi kết thúc).

Chưa làm, chuyển sang Đợt 3: thống kê hội nghị trên dashboard và trong `/reports`.

### Đợt 3: Mở rộng khi có nhu cầu

Thống kê trên dashboard và `/reports`, phản biện báo cáo, điểm danh, giấy chứng nhận, giải thưởng, liên kết lý lịch
khoa học và sản phẩm đề tài.

---

## 11. Quyết định đã chốt

| # | Câu hỏi | Quyết định |
| --- | --- | --- |
| 1 | Người được mời chưa có tài khoản | Hệ thống tạo tài khoản để nộp báo cáo và nhận chương trình |
| 2 | Xác nhận tham dự | Có nút nhận lời; nhận lời thì hệ thống tạo tài khoản |
| 3 | Yêu cầu sửa bài | Chuyên viên được yêu cầu sửa, báo cáo viên nộp lại |
| 4 | Kỷ yếu | Chuyên viên biên soạn bên ngoài, tải lên, hệ thống gửi |
| 5 | Xếp lịch | Trưởng tiểu ban gửi danh sách báo cáo; chuyên viên nhập phiên toàn thể và tiểu ban; hệ thống xếp lịch theo thời lượng tối đa mỗi báo cáo |
| — | Thư mời | Chỉ ghi thời gian tổ chức và địa điểm; chương trình chi tiết gửi sau khi xếp lịch |
| 6 | Chấp nhận tóm tắt | Không có bước này; báo cáo viên nộp tóm tắt và toàn văn bất cứ lúc nào trước hạn |
| 7 | Phiên toàn thể | Không song song: mọi nhà khoa học cùng dự; sau đó các tiểu ban chạy song song |
| 8 | Người trong Học viện chưa có tài khoản | Tạo tài khoản nội bộ theo đơn vị (chuyên viên chọn khi thêm khách mời), không phải tài khoản ngoài |

Không còn câu hỏi mở cho Đợt 1.
