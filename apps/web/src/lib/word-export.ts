import type { CouncilMember } from "@/lib/research-proposals-api";
import { buildDecisionHtml } from "@/lib/decision-document";
import {
  approvalDecisionDocument,
  councilDecisionDocument,
  directorSignatureTitle,
  productPanelDecisionDocument,
  type ApprovalDecisionInput,
  type CouncilDecisionInput,
  type ProductPanelDecisionInput
} from "@/lib/decision-templates";

/**
 * Xuất văn bản Word (.docx)
 * Conforms to Vietnamese Administrative Document Standards (Nghị định 30/2020/NĐ-CP)
 * and Military Science Regulations (Thông tư 14/2022/TT-BQP).
 */

/** Chỗ trống trên văn bản khi chưa có dữ liệu thật — không điền tên, nội dung, điểm số hay số quyết định giả. */
const BLANK = "…………………………";

/** Dữ liệu người dùng nhập được escape trước khi chèn vào HTML của văn bản. */
function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export { directorSignatureTitle };

export interface ExportWordOptions {
  filename: string;
  title: string;
  contentHtml: string;
  /** Khổ ngang cho biểu, bảng nhiều cột (mặc định khổ dọc). */
  orientation?: "portrait" | "landscape";
}

export interface ProposalExportData {
  id?: string;
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  hostOrganizationUnit?: string | null;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Bộ chuyển đổi DOCX chỉ đọc style viết trên chính thẻ: chép style của các lớp bảng vào thẻ, và cho mỗi đoạn văn
 * căn lề của khối bao ngoài gần nhất (tiêu đề "QUYẾT ĐỊNH" căn giữa nằm trong <div style="text-align: center">);
 * đoạn không có căn lề thì căn đều hai bên như CSS cũ của văn bản.
 */
function prepareForDocx(contentHtml: string) {
  const doc = new DOMParser().parseFromString(`<div>${contentHtml}</div>`, "text/html");
  const prepend = (element: Element, css: string) => element.setAttribute("style", `${css}; ${element.getAttribute("style") ?? ""}`);
  doc.querySelectorAll("table").forEach((table) => prepend(table, "border-collapse: collapse; width: 100%"));
  doc.querySelectorAll("table.border-table th, table.border-table td").forEach((cell) => prepend(cell, "border: 1px solid #000000; padding: 6pt 8pt; font-size: 12pt; vertical-align: middle"));
  doc.querySelectorAll("table.border-table th").forEach((cell) => prepend(cell, "background-color: #f2f2f2; font-weight: bold; text-align: center"));
  doc.querySelectorAll("table.header-table, table.footer-table").forEach((table) => prepend(table, "border: none"));
  doc.querySelectorAll("table.header-table td, table.footer-table td").forEach((cell) => prepend(cell, "border: none; padding: 2pt 4pt; vertical-align: top"));
  const alignOf = (element: Element) => /text-align:\s*(left|right|center|justify)/i.exec(element.getAttribute("style") ?? "")?.[1];
  doc.querySelectorAll("p, h1, h2, h3, h4").forEach((paragraph) => {
    if (alignOf(paragraph)) return;
    let ancestor = paragraph.parentElement;
    while (ancestor && !alignOf(ancestor)) ancestor = ancestor.parentElement;
    prepend(paragraph, `text-align: ${(ancestor && alignOf(ancestor)) || "justify"}`);
  });
  return doc.body.firstElementChild?.innerHTML ?? contentHtml;
}

/**
 * Xuất văn bản ra tệp Word thật (.docx, Office Open XML): khổ A4, lề trên/phải/dưới 20 mm, lề trái 25 mm,
 * Times New Roman 13pt. Bộ chuyển đổi chỉ được tải khi người dùng bấm xuất.
 */
export async function exportHtmlToWord({ filename, title, contentHtml, orientation = "portrait" }: ExportWordOptions) {
  const { default: htmlToDocx } = await import("@turbodocx/html-to-docx");
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${prepareForDocx(contentHtml)}</body></html>`;
  // Đơn vị: khổ giấy và lề tính bằng twip (1/20 pt), cỡ chữ tính bằng nửa điểm.
  const result = await htmlToDocx(html, null, {
    // Khổ A4 luôn khai báo theo chiều dọc; với "landscape" thư viện tự xoay trang.
    orientation,
    pageSize: { width: 11906, height: 16838 },
    margins: { top: 1134, right: 1134, bottom: 1134, left: 1418, header: 708, footer: 708 },
    title,
    creator: "DocManS - Học viện Quân y",
    font: "Times New Roman",
    fontSize: 26,
    complexScriptFontSize: 26,
    lang: "vi-VN",
    table: { row: { cantSplit: true } }
  });
  const blob = result instanceof Blob ? result : new Blob([result as ArrayBuffer], { type: DOCX_MIME });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename.replace(/\.docx?$/, "")}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// 1–2. QUYẾT ĐỊNH (thể thức chung theo mẫu Phòng KHQS: lib/decision-document.ts)
// -----------------------------------------------------------------------------
const fileCode = (code?: string | null) => (code || "chua_co_ma").replace(/[^a-zA-Z0-9]/g, "_");

/** Quyết định thành lập Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài (kèm Phụ lục I). */
export function exportCouncilDecisionWord(proposal: CouncilDecisionInput) {
  return exportHtmlToWord({
    filename: `Quyet_dinh_thanh_lap_Hoi_dong_${fileCode(proposal.code)}`,
    title: `Quyết định thành lập Hội đồng - ${proposal.code || proposal.title}`,
    contentHtml: buildDecisionHtml(councilDecisionDocument(proposal))
  });
}

/** Quyết định phê duyệt đề tài và kinh phí thực hiện. */
export function exportProposalApprovalDecisionWord(proposal: ApprovalDecisionInput) {
  return exportHtmlToWord({
    filename: `Quyet_dinh_phe_duyet_de_tai_${fileCode(proposal.code)}`,
    title: `Quyết định phê duyệt đề tài - ${proposal.code || proposal.title}`,
    contentHtml: buildDecisionHtml(approvalDecisionDocument(proposal))
  });
}

/** Quyết định thành lập Tổ thẩm định, đánh giá sản phẩm KH&CN của đề tài (kèm Phụ lục I, II). */
export function exportProductPanelDecisionWord(input: ProductPanelDecisionInput) {
  return exportHtmlToWord({
    filename: `Quyet_dinh_thanh_lap_To_tham_dinh_${fileCode(input.project.code)}`,
    title: `Quyết định thành lập Tổ thẩm định - ${input.project.code || input.project.title}`,
    contentHtml: buildDecisionHtml(productPanelDecisionDocument(input))
  });
}

// -----------------------------------------------------------------------------
// 3. BIÊN BẢN HỌP HỘI ĐỒNG ĐÁNH GIÁ ĐỀ TÀI (GIAI ĐOẠN 2)
// -----------------------------------------------------------------------------
export function exportCouncilMinutesWord(proposal: {
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  councilMetadata?: any;
}) {
  const council = proposal.councilMetadata || {};
  const minutes = council.councilMinutes || {};
  const dateObj = minutes.meetingConductedAt ? new Date(minutes.meetingConductedAt) : new Date();
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  const code = proposal.code || BLANK;
  const members = Array.isArray(council.members) ? council.members : [];
  const chair = members.find((m: CouncilMember) => m.role === "chair")?.displayName || BLANK;
  const secretary = minutes.recordedByName || members.find((m: CouncilMember) => m.role === "secretary")?.displayName || BLANK;

  const memberRows = members
    .map(
      (m: CouncilMember, idx: number) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><b>${esc(m.displayName)}</b></td>
        <td>${esc(m.academicTitle || "—")}</td>
        <td>${esc(m.unit || m.organization || "Học viện Quân y")}</td>
        <td style="text-align: center; font-weight: bold;">${esc(m.roleLabel || m.role)}</td>
        <td style="text-align: center;">Có mặt</td>
      </tr>
    `
    )
    .join("");

  const conclusionLabel = minutes.conclusionLabel || (minutes.conclusion === "approved" ? "Đạt yêu cầu (Đề nghị phê duyệt)" : "Cần chỉnh sửa bổ sung");

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 12pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 12pt;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">HỘI ĐỒNG TƯ VẤN ĐÁNH GIÁ</p>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="margin: 0; font-size: 12pt; font-style: italic;">Hà Nội, ngày ${day} tháng ${month} năm ${year}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 18pt 0 14pt 0;">
      <p style="margin: 0; font-size: 14pt; font-weight: bold;">BIÊN BẢN HỌP HỘI ĐỒNG</p>
      <p style="margin: 4pt 0 0 0; font-size: 13pt; font-weight: bold;">ĐÁNH GIÁ, XÉT DUYỆT THUYẾT MINH ĐỀ TÀI NCKH</p>
      <p style="margin: 2pt 0 0 0; font-size: 11pt; font-style: italic;">(Theo Thông tư số 14/2022/TT-BQP ngày 01/02/2022 của Bộ Quốc phòng)</p>
    </div>

    <div>
      <p><b>I. THÔNG TIN CHUNG</b></p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${esc(proposal.title)}</b></p>
      <p style="padding-left: 18pt;">- Mã số: <b>${esc(code)}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${esc(proposal.ownerDisplayName || BLANK)}</b></p>
      <p style="padding-left: 18pt;">- Thời gian họp: Ngày ${day} tháng ${month} năm ${year}</p>
      <p style="padding-left: 18pt;">- Địa điểm họp: ${esc(council.meetingLocation || BLANK)}</p>
      <p style="padding-left: 18pt;">- Quyết định thành lập Hội đồng số: <b>${esc(council.decisionNumber || BLANK)}</b></p>

      <p style="margin-top: 10pt;"><b>II. THÀNH PHẦN HỘI ĐỒNG VÀ ĐẠI BIỂU THAM DỰ</b></p>
      <table class="border-table">
        <thead>
          <tr>
            <th style="width: 6%;">TT</th>
            <th style="width: 26%;">Họ và tên</th>
            <th style="width: 20%;">Học hàm, học vị</th>
            <th style="width: 24%;">Đơn vị</th>
            <th style="width: 14%;">Trách nhiệm</th>
            <th style="width: 10%;">Tham dự</th>
          </tr>
        </thead>
        <tbody>
          ${memberRows}
        </tbody>
      </table>

      <p style="margin-top: 10pt;"><b>III. NỘI DUNG LÀM VIỆC VÀ KẾT QUẢ ĐÁNH GIÁ</b></p>
      <p style="padding-left: 18pt;">1. Đồng chí Chủ tịch Hội đồng quán triệt mục đích, yêu cầu và nội dung làm việc theo quy chế của Bộ Quốc phòng.</p>
      <p style="padding-left: 18pt;">2. Đồng chí Chủ nhiệm báo cáo tóm tắt thuyết minh đề tài nghiên cứu.</p>
      <p style="padding-left: 18pt;">3. Các đồng chí Ủy viên Phản biện 1 và Phản biện 2 trình bày bản nhận xét đánh giá chi tiết.</p>
      <p style="padding-left: 18pt;">4. Các thành viên Hội đồng thảo luận, chất vấn và cho ý kiến đóng góp hoàn thiện thuyết minh.</p>
      <p style="padding-left: 18pt;">5. Kết quả chấm điểm trung bình của Hội đồng: <b>${esc(minutes.averageScore ?? BLANK)}/100 điểm</b>.</p>

      <p style="margin-top: 10pt;"><b>IV. KẾT LUẬN CỦA HỘI ĐỒNG</b></p>
      <p style="padding-left: 18pt;">- Đánh giá chung: <i>${esc(minutes.summaryComments || BLANK)}</i></p>
      <p style="padding-left: 18pt;">- Kết luận xếp loại: <b>${conclusionLabel}</b></p>
      <p style="padding-left: 18pt;">- Nội dung yêu cầu hoàn thiện, bổ sung: <i>${esc(minutes.modificationsRequired || BLANK)}</i></p>

      <p style="margin-top: 10pt;">Phiên họp kết thúc hồi 11 giờ 30 phút cùng ngày. Biên bản đã được thông qua toàn thể Hội đồng nhất trí 100%.</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">THƯ KÝ KHOA HỌC</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(secretary)}</p>
        </td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CHỦ TỊCH HỘI ĐỒNG</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(chair)}</p>
        </td>
      </tr>
    </table>
  `;

  return exportHtmlToWord({
    filename: `Bien_ban_hop_Hoi_dong_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Biên bản họp Hội đồng - ${esc(code)}`,
    contentHtml
  });
}

// -----------------------------------------------------------------------------
// 4. BÁO CÁO TỔNG HỢP ĐÁNH GIÁ ĐỀ TÀI
// -----------------------------------------------------------------------------
export function exportEvaluationSummaryWord(proposal: {
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  evaluationSummary?: { summary?: string; recommendation?: string } | null;
  /** Trưởng phòng KHQS ký báo cáo; chưa biết thì để trống chỗ ký. */
  signerName?: string | null;
}) {
  const code = proposal.code || BLANK;
  const summary = proposal.evaluationSummary || {};
  const dateObj = new Date();
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 12pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 12pt;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">PHÒNG KHOA HỌC QUÂN SỰ</p>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="margin: 0; font-size: 12pt; font-style: italic;">Hà Nội, ngày ${day} tháng ${month} năm ${year}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 18pt 0 14pt 0;">
      <p style="margin: 0; font-size: 14pt; font-weight: bold;">BÁO CÁO TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ</p>
      <p style="margin: 4pt 0 0 0; font-size: 13pt; font-weight: bold;">THUYẾT MINH ĐỀ TÀI NGHIÊN CỨU KHOA HỌC</p>
    </div>

    <div>
      <p><b>1. THÔNG TIN ĐỀ TÀI:</b></p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${esc(proposal.title)}</b></p>
      <p style="padding-left: 18pt;">- Mã số hồ sơ: <b>${esc(code)}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${esc(proposal.ownerDisplayName || BLANK)}</b></p>

      <p style="margin-top: 10pt;"><b>2. TỔNG HỢP Ý KIẾN HỘI ĐỒNG VÀ PHẢN BIỆN:</b></p>
      <p style="padding-left: 18pt; text-align: justify;">${esc(summary.summary || BLANK)}</p>

      <p style="margin-top: 10pt;"><b>3. KIẾN NGHỊ CỦA CƠ QUAN QUẢN LÝ KHOA HỌC:</b></p>
      <p style="padding-left: 18pt; text-align: justify;">${esc(summary.recommendation || BLANK)}</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;"></td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">TRƯỞNG PHÒNG KHQS</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(proposal.signerName || BLANK)}</p>
        </td>
      </tr>
    </table>
  `;

  return exportHtmlToWord({
    filename: `Tong_hop_danh_gia_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Báo cáo tổng hợp đánh giá - ${esc(code)}`,
    contentHtml
  });
}

// -----------------------------------------------------------------------------
// 5. PHIẾU NHẬN XÉT, ĐÁNH GIÁ CỦA CHUYÊN GIA / THÀNH VIÊN HỘI ĐỒNG
// -----------------------------------------------------------------------------
export function exportIndividualReviewWord(
  proposal: {
    code?: string | null;
    title: string;
    ownerDisplayName?: string | null;
  },
  review: {
    reviewerDisplayName: string;
    reviewerUnit?: string;
    assignmentRoleLabel?: string;
    reviewTotalScore?: number | null;
    reviewRecommendationLabel?: string;
    comment?: string;
  }
) {
  const code = proposal.code || BLANK;
  const dateObj = new Date();
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 12pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 12pt;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">HỘI ĐỒNG ĐÁNH GIÁ ĐỀ TÀI</p>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="margin: 0; font-size: 12pt; font-style: italic;">Hà Nội, ngày ${day} tháng ${month} năm ${year}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 18pt 0 14pt 0;">
      <p style="margin: 0; font-size: 14pt; font-weight: bold;">PHIẾU NHẬN XÉT, ĐÁNH GIÁ THUYẾT MINH ĐỀ TÀI NCKH</p>
      <p style="margin: 4pt 0 0 0; font-size: 12pt; font-style: italic;">(Dành cho Chuyên gia phản biện và Thành viên Hội đồng - theo Thông tư số 14/2022/TT-BQP)</p>
    </div>

    <div>
      <p><b>I. THÔNG TIN CHUNG</b></p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${esc(proposal.title)}</b></p>
      <p style="padding-left: 18pt;">- Mã số đề tài: <b>${esc(code)}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${esc(proposal.ownerDisplayName || BLANK)}</b></p>
      <p style="padding-left: 18pt;">- Họ và tên người đánh giá: <b>${esc(review.reviewerDisplayName)}</b></p>
      <p style="padding-left: 18pt;">- Đơn vị công tác: <b>${esc(review.reviewerUnit || "Học viện Quân y")}</b></p>
      <p style="padding-left: 18pt;">- Trách nhiệm trong Hội đồng: <b>${esc(review.assignmentRoleLabel || "Ủy viên Phản biện")}</b></p>

      <p style="margin-top: 10pt;"><b>II. Ý KIẾN NHẬN XÉT, ĐÁNH GIÁ CHUYÊN MÔN</b></p>
      <p style="padding-left: 18pt;"><b>1. Tính cấp thiết và ý nghĩa thực tiễn:</b> Thuyết minh đề tài thể hiện rõ tính cấp thiết phục vụ công tác huấn luyện, điều trị và sẵn sàng chiến đấu quân y.</p>
      <p style="padding-left: 18pt;"><b>2. Mục tiêu, nội dung và phương pháp nghiên cứu:</b> Thiết kế nghiên cứu khoa học, cỡ mẫu và phương pháp xử lý số liệu phù hợp với điều kiện thực tế.</p>
      <p style="padding-left: 18pt;"><b>3. Tính khả thi và sản phẩm dự kiến:</b> Sản phẩm đáp ứng yêu cầu đặt hàng của đề tài nghiên cứu cấp cơ sở/ngành.</p>
      <p style="padding-left: 18pt;"><b>4. Nhận xét chi tiết:</b></p>
      <p style="padding-left: 28pt; font-style: italic;">"${esc(review.comment || BLANK)}"</p>

      <p style="margin-top: 10pt;"><b>III. KẾT QUẢ ĐÁNH GIÁ VÀ ĐỀ NGHỊ</b></p>
      <p style="padding-left: 18pt;">- Tổng điểm đánh giá: <b>${esc(review.reviewTotalScore ?? BLANK)}/100 điểm</b>.</p>
      <p style="padding-left: 18pt;">- Đề nghị của chuyên gia: <b>${esc(review.reviewRecommendationLabel || BLANK)}</b>.</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;"></td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">NGƯỜI ĐÁNH GIÁ</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(review.reviewerDisplayName)}</p>
        </td>
      </tr>
    </table>
  `;

  return exportHtmlToWord({
    filename: `Phieu_danh_gia_${review.reviewerDisplayName.replace(/[^a-zA-Z0-9]/g, "_")}_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Phiếu đánh giá - ${esc(review.reviewerDisplayName)} - ${esc(code)}`,
    contentHtml
  });
}

/**
 * Xuất Biên bản nghiệm thu và đánh giá kết quả NCKH (Thông tư 14/2022/TT-BQP)
 */
export function exportAcceptanceMinutesWord(
  proposal: ProposalExportData,
  acceptance: {
    councilType?: "FACILITY" | "OFFICIAL";
    meetingDate?: string;
    meetingLocation?: string;
    establishmentDecisionNumber?: string;
    decisionNumber?: string;
    members: Array<{ fullName: string; academicTitle?: string; unit?: string; role: string }>;
    evaluationResult?: {
      reportScore: number;
      scientificProductsScore: number;
      trainingProductsScore: number;
      militaryMedicalPracticalScore: number;
      totalScore: number;
      classification: "EXCELLENT" | "PASSED" | "FAILED";
      assessmentComments: string;
    };
    decisionSignerName?: string;
  }
) {
  const code = proposal.code || BLANK;
  const councilTypeLabel = acceptance.councilType === "FACILITY" ? "CƠ SỞ" : "CHÍNH THỨC";
  // Chưa có biên bản thì để trống, không in kết quả giả.
  const scores = acceptance.evaluationResult || {
    reportScore: BLANK,
    scientificProductsScore: BLANK,
    trainingProductsScore: BLANK,
    militaryMedicalPracticalScore: BLANK,
    totalScore: BLANK,
    classification: "",
    assessmentComments: BLANK
  };

  const classificationText =
    scores.classification === "EXCELLENT"
      ? "XUẤT SẮC"
      : scores.classification === "PASSED"
      ? "ĐẠT"
      : scores.classification === "FAILED"
      ? "KHÔNG ĐẠT"
      : BLANK;

  const memberRows = acceptance.members.map((m, idx) => `
    <tr>
      <td style="text-align: center; border: 1px solid #000; padding: 5pt;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 5pt;"><b>${esc(m.fullName)}</b></td>
      <td style="border: 1px solid #000; padding: 5pt;">${esc(m.academicTitle || "TS")} - ${esc(m.unit || "Học viện Quân y")}</td>
      <td style="text-align: center; border: 1px solid #000; padding: 5pt;">${esc(m.role)}</td>
    </tr>
  `).join("");

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 15pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 11pt;">BỘ QUỐC PHÒNG</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">HỌC VIỆN QUÂN Y</p>
          <div style="border-bottom: 1.5pt solid #000; width: 120pt; margin: 3pt auto 0 auto;"></div>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 11pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <div style="border-bottom: 1.5pt solid #000; width: 140pt; margin: 3pt auto 0 auto;"></div>
          <p style="margin: 6pt 0 0 0; font-size: 11pt; font-style: italic;">Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 18pt 0 14pt 0;">
      <p style="margin: 0; font-size: 15pt; font-weight: bold;">BIÊN BẢN HỌP HỘI ĐỒNG ĐÁNH GIÁ, NGHIỆM THU KẾT QUẢ NCKH</p>
      <p style="margin: 4pt 0 0 0; font-size: 13pt; font-weight: bold; color: #1e3a8a;">(NGHIỆM THU ${councilTypeLabel})</p>
      <p style="margin: 3pt 0 0 0; font-size: 11pt; font-style: italic;">(Theo Thông tư số 14/2022/TT-BQP ngày 01/02/2022 của Bộ Quốc phòng)</p>
    </div>

    <div>
      <p><b>I. THÔNG TIN CHUNG</b></p>
      <p style="padding-left: 18pt;">- Tên đề tài/nhiệm vụ: <b>${esc(proposal.title)}</b></p>
      <p style="padding-left: 18pt;">- Mã số đề tài: <b>${esc(code)}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${esc(proposal.ownerDisplayName || BLANK)}</b></p>
      <p style="padding-left: 18pt;">- Cơ quan chủ trì: <b>${esc(proposal.hostOrganizationUnit || "Học viện Quân y")}</b></p>
      <p style="padding-left: 18pt;">- Quyết định thành lập Hội đồng số: <b>${esc(acceptance.decisionNumber || acceptance.establishmentDecisionNumber || BLANK)}</b></p>
      <p style="padding-left: 18pt;">- Thời gian họp: <b>${esc(acceptance.meetingDate || BLANK)}</b>. Địa điểm: <b>${esc(acceptance.meetingLocation || BLANK)}</b></p>

      <p style="margin-top: 10pt;"><b>II. THÀNH PHẦN HỘI ĐỒNG</b></p>
      <table style="width: 100%; border: 1px solid #000; margin: 8pt 0;">
        <thead>
          <tr style="background-color: #f1f5f9;">
            <th style="border: 1px solid #000; padding: 5pt; width: 8%;">TT</th>
            <th style="border: 1px solid #000; padding: 5pt; width: 32%;">Họ và tên</th>
            <th style="border: 1px solid #000; padding: 5pt; width: 40%;">Học hàm, học vị, Đơn vị</th>
            <th style="border: 1px solid #000; padding: 5pt; width: 20%;">Chức danh HĐ</th>
          </tr>
        </thead>
        <tbody>
          ${memberRows}
        </tbody>
      </table>

      <p style="margin-top: 10pt;"><b>III. KẾT QUẢ ĐÁNH GIÁ THEO 4 TIÊU CHÍ CHUẨN QUÂN ĐỘI</b></p>
      <table style="width: 100%; border: 1px solid #000; margin: 8pt 0;">
        <thead>
          <tr style="background-color: #f1f5f9;">
            <th style="border: 1px solid #000; padding: 5pt; width: 8%;">TT</th>
            <th style="border: 1px solid #000; padding: 5pt; width: 62%;">Nội dung / Tiêu chí đánh giá</th>
            <th style="border: 1px solid #000; padding: 5pt; width: 15%; text-align: center;">Điểm tối đa</th>
            <th style="border: 1px solid #000; padding: 5pt; width: 15%; text-align: center;">Điểm đạt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">1</td>
            <td style="border: 1px solid #000; padding: 5pt;">Chất lượng Báo cáo tổng kết và Báo cáo tóm tắt</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">30</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt; font-weight: bold;">${scores.reportScore}</td>
          </tr>
          <tr>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">2</td>
            <td style="border: 1px solid #000; padding: 5pt;">Sản phẩm khoa học (Bài báo quốc tế/trong nước, sáng chế, sách chuyên khảo)</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">30</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt; font-weight: bold;">${scores.scientificProductsScore}</td>
          </tr>
          <tr>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">3</td>
            <td style="border: 1px solid #000; padding: 5pt;">Sản phẩm đào tạo (Hướng dẫn NCS, Thạc sĩ, Bác sĩ chuyên khoa II)</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">15</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt; font-weight: bold;">${scores.trainingProductsScore}</td>
          </tr>
          <tr>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">4</td>
            <td style="border: 1px solid #000; padding: 5pt;">Hiệu quả và khả năng ứng dụng thực tiễn y dược quân sự, điều trị thương bệnh binh</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">25</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt; font-weight: bold;">${scores.militaryMedicalPracticalScore}</td>
          </tr>
          <tr style="background-color: #f8fafc; font-weight: bold;">
            <td colspan="2" style="border: 1px solid #000; padding: 5pt; text-align: right;">TỔNG ĐIỂM TRUNG BÌNH CỦA HỘI ĐỒNG:</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt;">100</td>
            <td style="text-align: center; border: 1px solid #000; padding: 5pt; font-size: 14pt; color: #15803d;">${scores.totalScore}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 10pt;"><b>IV. KẾT LUẬN VÀ KIẾN NGHỊ CỦA HỘI ĐỒNG</b></p>
      <p style="padding-left: 18pt;">- Đánh giá xếp loại: <b style="font-size: 14pt; color: #1e3a8a;">${classificationText}</b></p>
      <p style="padding-left: 18pt;">- Nhận xét chung của Hội đồng:</p>
      <p style="padding-left: 28pt; font-style: italic;">"${esc(scores.assessmentComments)}"</p>
      <p style="padding-left: 18pt;">- Hội đồng thống nhất thông qua kết quả nghiệm thu và đề nghị Thủ trưởng Học viện ra Quyết định công nhận kết quả nghiên cứu.</p>
    </div>

    <!-- SIGNATURES -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">THƯ KÝ HỘI ĐỒNG</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(acceptance.members.find(m => m.role.includes("SECRETARY"))?.fullName || "Thư ký HĐ")}</p>
        </td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CHỦ TỊCH HỘI ĐỒNG</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(acceptance.members.find(m => m.role.includes("CHAIRMAN"))?.fullName || "Chủ tịch HĐ")}</p>
        </td>
      </tr>
    </table>
  `;

  return exportHtmlToWord({
    filename: `Bien_ban_nghiem_thu_${councilTypeLabel}_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Biên bản nghiệm thu ${councilTypeLabel} - ${esc(code)}`,
    contentHtml
  });
}

/**
 * Xuất Giấy chứng nhận Chấp thuận Đạo đức Y sinh (IRB)
 */
export function exportIrbCertificateWord(
  proposal: ProposalExportData,
  irb: {
    certificateNumber?: string;
    approvalDate?: string;
    validUntil?: string;
    riskLevel?: "MINIMAL" | "LOW" | "HIGH";
    councilPresident?: string;
    ethicsNotes?: string;
  }
) {
  const code = proposal.code || BLANK;
  const certNumber = irb.certificateNumber || BLANK;
  const approvalDate = irb.approvalDate || new Date().toLocaleDateString("vi-VN");
  const validUntil = irb.validUntil || BLANK;
  const riskLevelLabel =
    irb.riskLevel === "MINIMAL"
      ? "Rủi ro tối thiểu (Minimal Risk)"
      : irb.riskLevel === "HIGH"
      ? "Rủi ro cao (High Risk)"
      : "Rủi ro thấp (Low Risk)";

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 15pt;">
      <tr>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 11pt;">BỘ QUỐC PHÒNG</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 0; font-size: 10pt; font-weight: bold;">HỘI ĐỒNG ĐẠO ĐỨC TRONG NGHIÊN CỨU Y SINH HỌC</p>
          <div style="border-bottom: 1.5pt solid #000; width: 140pt; margin: 3pt auto 0 auto;"></div>
          <p style="margin: 4pt 0 0 0; font-size: 10pt;">Số: <b>${esc(certNumber)}</b></p>
        </td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 11pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <div style="border-bottom: 1.5pt solid #000; width: 140pt; margin: 3pt auto 0 auto;"></div>
          <p style="margin: 6pt 0 0 0; font-size: 11pt; font-style: italic;">Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 25pt 0 15pt 0;">
      <p style="margin: 0; font-size: 16pt; font-weight: bold; color: #1e3a8a;">GIẤY CHỨNG NHẬN CHẤP THUẬN ĐẠO ĐỨC</p>
      <p style="margin: 4pt 0 0 0; font-size: 13pt; font-weight: bold;">TRONG NGHIÊN CỨU Y SINH HỌC</p>
      <p style="margin: 3pt 0 0 0; font-size: 11pt; font-style: italic;">(Institutional Review Board Ethical Approval Certificate)</p>
    </div>

    <div>
      <p style="text-indent: 20pt;">Hội đồng Đạo đức trong Nghiên cứu Y sinh học - Học viện Quân y đã xem xét, đánh giá hồ sơ nghiên cứu:</p>
      <p style="padding-left: 20pt;">- Tên đề tài/nghiên cứu: <b>${esc(proposal.title)}</b></p>
      <p style="padding-left: 20pt;">- Mã số đề tài: <b>${esc(code)}</b></p>
      <p style="padding-left: 20pt;">- Chủ nhiệm đề tài: <b>${esc(proposal.ownerDisplayName || BLANK)}</b></p>
      <p style="padding-left: 20pt;">- Cơ quan chủ trì: <b>${esc(proposal.hostOrganizationUnit || "Học viện Quân y")}</b></p>
      <p style="padding-left: 20pt;">- Phân loại mức độ rủi ro: <b>${riskLevelLabel}</b></p>

      <p style="margin-top: 12pt; text-indent: 20pt;"><b>QUYẾT NGHỊ:</b></p>
      <p style="padding-left: 20pt;">1. <b>CHẤP THUẬN</b> về khía cạnh đạo đức đối với quy trình nghiên cứu, mẫu bệnh phẩm, đối tượng tình nguyện tham gia và phương án bảo đảm an toàn sinh học.</p>
      <p style="padding-left: 20pt;">2. Giấy chứng nhận này có hiệu lực từ ngày <b>${esc(approvalDate)}</b> đến ngày <b>${esc(validUntil)}</b>.</p>
      <p style="padding-left: 20pt;">3. Chủ nhiệm đề tài có trách nhiệm báo cáo định kỳ cho Hội đồng và báo cáo ngay lập tức các biến cố bất lợi nghiêm trọng (SAE) nếu phát sinh.</p>
      <p style="padding-left: 20pt; font-style: italic;">Ghi chú của Hội đồng: "${esc(irb.ethicsNotes || BLANK)}"</p>
    </div>

    <!-- SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 30pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold;">NƠI NHẬN:</p>
          <p style="margin: 2pt 0 0 0; font-size: 10pt; text-align: left; padding-left: 20pt;">- Ban Giám đốc Học viện (để b/c);<br>- Phòng KHQS;<br>- Chủ nhiệm đề tài;<br>- Lưu: HĐ ĐĐ, BQLKH.</p>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">TM. HỘI ĐỒNG ĐẠO ĐỨC Y SINH HỌC</p>
          <p style="margin: 2pt 0 0 0; font-size: 11pt; font-weight: bold;">CHỦ TỊCH HỘI ĐỒNG</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký, ghi rõ họ tên và đóng dấu)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${esc(irb.councilPresident || BLANK)}</p>
        </td>
      </tr>
    </table>
  `;

  return exportHtmlToWord({
    filename: `Giay_chung_nhan_IRB_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Giấy chứng nhận IRB - ${esc(code)}`,
    contentHtml
  });
}

