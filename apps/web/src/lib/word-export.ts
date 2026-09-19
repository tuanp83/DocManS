/**
 * Word Document (.doc / .docx compatible) Export Utility
 * Conforms to Vietnamese Administrative Document Standards (Nghị định 30/2020/NĐ-CP)
 * and Military Science Regulations (Thông tư 57/2021/TT-BQP).
 */

export interface ExportWordOptions {
  filename: string;
  title: string;
  contentHtml: string;
}

/**
 * Exports HTML content as a Microsoft Word document (.doc) with full styling,
 * margins, typography (Times New Roman), and table structures preserved.
 */
export function exportHtmlToWord({ filename, title, contentHtml }: ExportWordOptions) {
  const fullHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page Section1 {
          size: 595.3pt 841.9pt; /* A4: 210mm x 297mm */
          margin: 56.7pt 56.7pt 56.7pt 70.9pt; /* Top 20mm, Right 20mm, Bottom 20mm, Left 25mm */
          mso-header-margin: 35.4pt;
          mso-footer-margin: 35.4pt;
          mso-paper-source: 0;
        }
        div.Section1 {
          page: Section1;
        }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 13pt;
          line-height: 1.35;
          color: #000000;
        }
        h1, h2, h3, h4 {
          font-family: 'Times New Roman', Times, serif;
          margin: 6pt 0;
        }
        p {
          margin: 4pt 0;
          text-align: justify;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 8pt 0;
        }
        table.border-table th, table.border-table td {
          border: 1px solid #000000;
          padding: 6pt 8pt;
          font-size: 12pt;
          vertical-align: middle;
        }
        table.border-table th {
          background-color: #f2f2f2;
          font-weight: bold;
          text-align: center;
        }
        table.header-table td, table.footer-table td {
          border: none;
          padding: 2pt 4pt;
          vertical-align: top;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-justify { text-align: justify; }
        .font-bold { font-weight: bold; }
        .font-italic { font-style: italic; }
        .uppercase { text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="Section1">
        ${contentHtml}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(["\ufeff", fullHtml], {
    type: "application/msword;charset=utf-8"
  });

  const finalName = filename.endsWith(".doc") || filename.endsWith(".docx")
    ? filename
    : `${filename}.doc`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// 1. QUYẾT ĐỊNH THÀNH LẬP HỘI ĐỒNG ĐÁNH GIÁ (GIAI ĐOẠN 1)
// -----------------------------------------------------------------------------
export function exportCouncilDecisionWord(proposal: {
  code?: string | null;
  title: string;
  councilMetadata?: any;
}) {
  const council = proposal.councilMetadata || {};
  const dateObj = council.decidedAt ? new Date(council.decidedAt) : new Date();
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  const code = proposal.code || "HVQY-2026/ĐTTN";
  const decisionNumber = council.decisionNumber || `QĐ-TLHĐ-${code.replace(/[^a-zA-Z0-9]/g, "")}/HVQY`;
  const signatory = council.decidedByName || "GS. TS. Trần Viết Tiến";
  const members = Array.isArray(council.members) ? council.members : [];

  const memberRows = members
    .map(
      (m: any, idx: number) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><b>${m.displayName}</b></td>
        <td>${m.academicTitle || "—"}</td>
        <td>${m.unit || m.organization || "Học viện Quân y"}</td>
        <td style="text-align: center; font-weight: bold;">${m.roleLabel || m.role}</td>
      </tr>
    `
    )
    .join("");

  const meetingDateStr = council.meetingDate
    ? new Intl.DateTimeFormat("vi-VN").format(new Date(council.meetingDate))
    : "theo kế hoạch của Ban Quản lý KHQS";

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 12pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 12pt;">BỘ QUỐC PHÒNG</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 0; font-size: 11pt;">Số: <b>${decisionNumber}</b></p>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="margin: 0; font-size: 12pt; font-style: italic;">Hà Nội, ngày ${day} tháng ${month} năm ${year}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 18pt 0 14pt 0;">
      <p style="margin: 0; font-size: 14pt; font-weight: bold;">QUYẾT ĐỊNH</p>
      <p style="margin: 4pt 0 0 0; font-size: 13pt; font-weight: bold;">Về việc thành lập Hội đồng tư vấn xét duyệt thuyết minh đề tài nghiên cứu khoa học</p>
    </div>

    <div style="text-align: center; margin-bottom: 12pt;">
      <p style="margin: 0; font-size: 13pt; font-weight: bold;">GIÁM ĐỐC HỌC VIỆN QUÂN Y</p>
    </div>

    <div style="margin-bottom: 12pt; font-size: 12pt; font-style: italic;">
      <p>Căn cứ Luật Khoa học và Công nghệ ngày 18 tháng 6 năm 2013;</p>
      <p>Căn cứ Thông tư số 57/2021/TT-BQP ngày 06 tháng 5 năm 2021 của Bộ trưởng Bộ Quốc phòng quy định về quản lý nhiệm vụ khoa học và công nghệ trong Bộ Quốc phòng;</p>
      <p>Căn cứ Quy chế tổ chức và hoạt động nghiên cứu khoa học của Học viện Quân y ban hành kèm theo Quyết định của Giám đốc Học viện;</p>
      <p>Xét đề nghị của đồng chí Trưởng phòng Khoa học Quân sự tại Tờ trình ngày ${day} tháng ${month} năm ${year},</p>
    </div>

    <div style="text-align: center; margin: 12pt 0;">
      <p style="margin: 0; font-size: 13pt; font-weight: bold;">QUYẾT ĐỊNH:</p>
    </div>

    <div>
      <p><b>Điều 1.</b> Thành lập Hội đồng tư vấn xét duyệt thuyết minh đề tài nghiên cứu khoa học cấp Học viện/Bộ Quốc phòng:</p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${proposal.title}</b></p>
      <p style="padding-left: 18pt;">- Mã số hồ sơ: <b>${code}</b></p>
      <p style="padding-left: 18pt;">- Hội đồng gồm các đồng chí có tên trong danh sách sau:</p>

      <table class="border-table" style="margin: 10pt 0;">
        <thead>
          <tr>
            <th style="width: 6%;">TT</th>
            <th style="width: 28%;">Họ và tên</th>
            <th style="width: 22%;">Học hàm, học vị</th>
            <th style="width: 26%;">Đơn vị công tác</th>
            <th style="width: 18%;">Trách nhiệm</th>
          </tr>
        </thead>
        <tbody>
          ${memberRows}
        </tbody>
      </table>

      <p><b>Điều 2.</b> Trách nhiệm và thời gian làm việc của Hội đồng:</p>
      <p style="padding-left: 18pt;">1. Hội đồng có nhiệm vụ nghiên cứu hồ sơ thuyết minh đề tài, đánh giá khách quan, trung thực, chính xác theo đúng các tiêu chí quy định tại Thông tư 57/2021/TT-BQP của Bộ Quốc phòng.</p>
      <p style="padding-left: 18pt;">2. Thời gian tiến hành phiên họp: Dự kiến ngày <b>${meetingDateStr}</b> tại Học viện Quân y.</p>
      <p style="padding-left: 18pt;">3. Kinh phí hoạt động của Hội đồng thực hiện theo quy định hiện hành của Bộ Quốc phòng và Học viện.</p>

      <p><b>Điều 3.</b> Quyết định này có hiệu lực kể từ ngày ký. Hội đồng tự giải thể sau khi hoàn thành nhiệm vụ.</p>
      <p>Các đồng chí Thủ trưởng Phòng Khoa học Quân sự, Phòng Tài chính, các đơn vị liên quan và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành Quyết định này./.</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 20pt;">
      <tr>
        <td style="width: 45%; vertical-align: top;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold; font-style: italic;">Nơi nhận:</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Ban Giám đốc Học viện (để b/c);</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Như Điều 3 (để thực hiện);</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Phòng KHQS, Phòng TC;</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Lưu: VT, KHQS.</p>
        </td>
        <td style="width: 55%; text-align: center; vertical-align: top;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">KT. GIÁM ĐỐC</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">PHÓ GIÁM ĐỐC</p>
          <p style="margin: 4pt 0 40pt 0; font-size: 10pt; font-style: italic;">(Đã ký và đóng dấu)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${signatory}</p>
        </td>
      </tr>
    </table>
  `;

  exportHtmlToWord({
    filename: `Quyet_dinh_thanh_lap_Hoi_dong_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Quyết định thành lập Hội đồng - ${code}`,
    contentHtml
  });
}

// -----------------------------------------------------------------------------
// 2. QUYẾT ĐỊNH PHÊ DUYỆT ĐỀ TÀI & KINH PHÍ
// -----------------------------------------------------------------------------
export function exportProposalApprovalDecisionWord(proposal: {
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  hostOrganizationUnitName?: string | null;
  budgetMetadata?: any;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const dateObj = new Date();
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  const code = proposal.code || "HVQY-2026/NCKH";
  const decisionNumber = `QĐ-HVQY/${code.replace(/[^a-zA-Z0-9]/g, "")}`;
  const amount = proposal.budgetMetadata?.approvedAmount || proposal.budgetMetadata?.amount || 0;
  const formattedAmount = new Intl.NumberFormat("vi-VN").format(amount);

  const contentHtml = `
    <!-- HEADER -->
    <table class="header-table" style="width: 100%; margin-bottom: 12pt;">
      <tr>
        <td style="width: 45%; text-align: center;">
          <p style="margin: 0; font-size: 12pt;">BỘ QUỐC PHÒNG</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 0; font-size: 11pt;">Số: <b>${decisionNumber}</b></p>
        </td>
        <td style="width: 55%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="margin: 0; font-size: 12pt; font-style: italic;">Hà Nội, ngày ${day} tháng ${month} năm ${year}</p>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 18pt 0 14pt 0;">
      <p style="margin: 0; font-size: 14pt; font-weight: bold;">QUYẾT ĐỊNH</p>
      <p style="margin: 4pt 0 0 0; font-size: 13pt; font-weight: bold;">Về việc phê duyệt đề tài nghiên cứu khoa học và phát triển công nghệ</p>
    </div>

    <div style="text-align: center; margin-bottom: 12pt;">
      <p style="margin: 0; font-size: 13pt; font-weight: bold;">GIÁM ĐỐC HỌC VIỆN QUÂN Y</p>
    </div>

    <div style="margin-bottom: 12pt; font-size: 12pt; font-style: italic;">
      <p>Căn cứ Luật Khoa học và Công nghệ ngày 18 tháng 6 năm 2013;</p>
      <p>Căn cứ Thông tư số 57/2021/TT-BQP ngày 06 tháng 5 năm 2021 của Bộ trưởng Bộ Quốc phòng quy định về quản lý nhiệm vụ khoa học và công nghệ trong Bộ Quốc phòng;</p>
      <p>Căn cứ Biên bản họp và Kết luận của Hội đồng tư vấn xét duyệt thuyết minh đề tài;</p>
      <p>Theo đề nghị của đồng chí Trưởng phòng Khoa học Quân sự và Trưởng phòng Tài chính Học viện,</p>
    </div>

    <div style="text-align: center; margin: 12pt 0;">
      <p style="margin: 0; font-size: 13pt; font-weight: bold;">QUYẾT ĐỊNH:</p>
    </div>

    <div>
      <p><b>Điều 1.</b> Phê duyệt chính thức đề tài nghiên cứu khoa học với các nội dung sau:</p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${proposal.title}</b></p>
      <p style="padding-left: 18pt;">- Mã số đề tài: <b>${code}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${proposal.ownerDisplayName || "TS. Phạm Anh Tuấn"}</b></p>
      <p style="padding-left: 18pt;">- Đơn vị chủ trì: <b>${proposal.hostOrganizationUnitName || "Học viện Quân y"}</b></p>
      <p style="padding-left: 18pt;">- Thời gian thực hiện: từ <b>${proposal.startDate ? new Intl.DateTimeFormat("vi-VN").format(new Date(proposal.startDate)) : "2026"}</b> đến <b>${proposal.endDate ? new Intl.DateTimeFormat("vi-VN").format(new Date(proposal.endDate)) : "2027"}</b>.</p>

      <p><b>Điều 2.</b> Kinh phí thực hiện đề tài:</p>
      <p style="padding-left: 18pt;">- Tổng kinh phí được phê duyệt: <b>${formattedAmount} VNĐ</b></p>
      <p style="padding-left: 18pt;">- Nguồn kinh phí: Ngân sách sự nghiệp khoa học quân sự được giao dự toán năm ${year}.</p>
      <p style="padding-left: 18pt;">- Việc thanh quyết toán kinh phí thực hiện theo quy chế tài chính hiện hành của Bộ Quốc phòng.</p>

      <p><b>Điều 3.</b> Trách nhiệm thi hành:</p>
      <p style="padding-left: 18pt;">Chủ nhiệm đề tài và đơn vị chủ trì chịu trách nhiệm tổ chức triển khai nghiên cứu theo đúng thuyết minh đã duyệt, đảm bảo tiến độ, chất lượng và an toàn tuyệt đối.</p>
      <p style="padding-left: 18pt;">Các đồng chí Trưởng phòng Khoa học Quân sự, Trưởng phòng Tài chính, các cơ quan chức năng và Chủ nhiệm đề tài chịu trách nhiệm thi hành Quyết định này./.</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 20pt;">
      <tr>
        <td style="width: 45%; vertical-align: top;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold; font-style: italic;">Nơi nhận:</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Ban Giám đốc Học viện (để b/c);</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Cục Quân Y (để b/c);</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Như Điều 3;</p>
          <p style="margin: 0; font-size: 10pt; font-style: italic;">- Lưu: VT, KHQS.</p>
        </td>
        <td style="width: 55%; text-align: center; vertical-align: top;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">GIÁM ĐỐC</p>
          <p style="margin: 4pt 0 40pt 0; font-size: 10pt; font-style: italic;">(Đã ký và đóng dấu)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">GS. TS. Trần Viết Tiến</p>
        </td>
      </tr>
    </table>
  `;

  exportHtmlToWord({
    filename: `Quyet_dinh_phe_duyet_de_tai_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Quyết định phê duyệt đề tài - ${code}`,
    contentHtml
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

  const code = proposal.code || "HVQY-2026/ĐTTN";
  const members = Array.isArray(council.members) ? council.members : [];
  const chair = members.find((m: any) => m.role === "chair")?.displayName || "GS. TS. Trần Viết Tiến";
  const secretary = minutes.recordedByName || members.find((m: any) => m.role === "secretary")?.displayName || "TS. Nguyễn Minh Phương";

  const memberRows = members
    .map(
      (m: any, idx: number) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><b>${m.displayName}</b></td>
        <td>${m.academicTitle || "—"}</td>
        <td>${m.unit || m.organization || "Học viện Quân y"}</td>
        <td style="text-align: center; font-weight: bold;">${m.roleLabel || m.role}</td>
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
      <p style="margin: 2pt 0 0 0; font-size: 11pt; font-style: italic;">(Theo Mẫu 03 - Thông tư 57/2021/TT-BQP)</p>
    </div>

    <div>
      <p><b>I. THÔNG TIN CHUNG</b></p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${proposal.title}</b></p>
      <p style="padding-left: 18pt;">- Mã số: <b>${code}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${proposal.ownerDisplayName || "TS. Phạm Anh Tuấn"}</b></p>
      <p style="padding-left: 18pt;">- Thời gian họp: Ngày ${day} tháng ${month} năm ${year}</p>
      <p style="padding-left: 18pt;">- Địa điểm họp: ${council.meetingLocation || "Phòng họp 1 - Tòa nhà Trung tâm - Học viện Quân y"}</p>
      <p style="padding-left: 18pt;">- Quyết định thành lập Hội đồng số: <b>${council.decisionNumber || "QĐ-TLHĐ/HVQY"}</b></p>

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
      <p style="padding-left: 18pt;">5. Kết quả chấm điểm trung bình của Hội đồng: <b>${minutes.averageScore || 88.5}/100 điểm</b>.</p>

      <p style="margin-top: 10pt;"><b>IV. KẾT LUẬN CỦA HỘI ĐỒNG</b></p>
      <p style="padding-left: 18pt;">- Đánh giá chung: <i>${minutes.summaryComments || "Đề tài có tính cấp thiết cao, phương pháp nghiên cứu chặt chẽ, có ý nghĩa quan trọng trong công tác y học quân sự."}</i></p>
      <p style="padding-left: 18pt;">- Kết luận xếp loại: <b>${conclusionLabel}</b></p>
      <p style="padding-left: 18pt;">- Nội dung yêu cầu hoàn thiện, bổ sung: <i>${minutes.modificationsRequired || "Chủ nhiệm đề tài chỉnh sửa, hoàn thiện hồ sơ theo góp ý của Hội đồng và nộp lại Phòng KHQS trước khi trình ký phê duyệt."}</i></p>

      <p style="margin-top: 10pt;">Phiên họp kết thúc hồi 11 giờ 30 phút cùng ngày. Biên bản đã được thông qua toàn thể Hội đồng nhất trí 100%.</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">THƯ KÝ KHOA HỌC</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${secretary}</p>
        </td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">CHỦ TỊCH HỘI ĐỒNG</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${chair}</p>
        </td>
      </tr>
    </table>
  `;

  exportHtmlToWord({
    filename: `Bien_ban_hop_Hoi_dong_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Biên bản họp Hội đồng - ${code}`,
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
  evaluationSummary?: any;
}) {
  const code = proposal.code || "HVQY-2026/ĐTTN";
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
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${proposal.title}</b></p>
      <p style="padding-left: 18pt;">- Mã số hồ sơ: <b>${code}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${proposal.ownerDisplayName || "TS. Phạm Anh Tuấn"}</b></p>

      <p style="margin-top: 10pt;"><b>2. TỔNG HỢP Ý KIẾN HỘI ĐỒNG VÀ PHẢN BIỆN:</b></p>
      <p style="padding-left: 18pt; text-align: justify;">${summary.summary || "Hội đồng đánh giá và các chuyên gia phản biện thống nhất thông qua đề tài với sự nhất trí cao. Hồ sơ thuyết minh đầy đủ, tính khoa học và thực tiễn đáp ứng yêu cầu nhiệm vụ quân y."}</p>

      <p style="margin-top: 10pt;"><b>3. KIẾN NGHỊ CỦA CƠ QUAN QUẢN LÝ KHOA HỌC:</b></p>
      <p style="padding-left: 18pt; text-align: justify;">${summary.recommendation || "Kính trình Thủ trưởng Ban Giám đốc Học viện xem xét, phê duyệt chính thức giao nhiệm vụ và dự toán kinh phí để Chủ nhiệm triển khai nghiên cứu."}</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;"></td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">TRƯỞNG PHÒNG KHQS</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">TS. Nguyễn Minh Phương</p>
        </td>
      </tr>
    </table>
  `;

  exportHtmlToWord({
    filename: `Tong_hop_danh_gia_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Báo cáo tổng hợp đánh giá - ${code}`,
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
  const code = proposal.code || "HVQY-2026/ĐTTN";
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
      <p style="margin: 4pt 0 0 0; font-size: 12pt; font-style: italic;">(Dành cho Chuyên gia phản biện và Thành viên Hội đồng - Mẫu 02 Thông tư 57/2021/TT-BQP)</p>
    </div>

    <div>
      <p><b>I. THÔNG TIN CHUNG</b></p>
      <p style="padding-left: 18pt;">- Tên đề tài: <b>${proposal.title}</b></p>
      <p style="padding-left: 18pt;">- Mã số đề tài: <b>${code}</b></p>
      <p style="padding-left: 18pt;">- Chủ nhiệm đề tài: <b>${proposal.ownerDisplayName || "TS. Phạm Anh Tuấn"}</b></p>
      <p style="padding-left: 18pt;">- Họ và tên người đánh giá: <b>${review.reviewerDisplayName}</b></p>
      <p style="padding-left: 18pt;">- Đơn vị công tác: <b>${review.reviewerUnit || "Học viện Quân y"}</b></p>
      <p style="padding-left: 18pt;">- Trách nhiệm trong Hội đồng: <b>${review.assignmentRoleLabel || "Ủy viên Phản biện"}</b></p>

      <p style="margin-top: 10pt;"><b>II. Ý KIẾN NHẬN XÉT, ĐÁNH GIÁ CHUYÊN MÔN</b></p>
      <p style="padding-left: 18pt;"><b>1. Tính cấp thiết và ý nghĩa thực tiễn:</b> Thuyết minh đề tài thể hiện rõ tính cấp thiết phục vụ công tác huấn luyện, điều trị và sẵn sàng chiến đấu quân y.</p>
      <p style="padding-left: 18pt;"><b>2. Mục tiêu, nội dung và phương pháp nghiên cứu:</b> Thiết kế nghiên cứu khoa học, cỡ mẫu và phương pháp xử lý số liệu phù hợp với điều kiện thực tế.</p>
      <p style="padding-left: 18pt;"><b>3. Tính khả thi và sản phẩm dự kiến:</b> Sản phẩm đáp ứng yêu cầu đặt hàng của đề tài nghiên cứu cấp cơ sở/ngành.</p>
      <p style="padding-left: 18pt;"><b>4. Nhận xét chi tiết:</b></p>
      <p style="padding-left: 28pt; font-style: italic;">"${review.comment || "Đồng ý thông qua hồ sơ đề tài. Đề nghị chủ nhiệm hoàn thiện kế hoạch chi tiết theo các mốc tiến độ."}"</p>

      <p style="margin-top: 10pt;"><b>III. KẾT QUẢ ĐÁNH GIÁ VÀ ĐỀ NGHỊ</b></p>
      <p style="padding-left: 18pt;">- Tổng điểm đánh giá: <b>${review.reviewTotalScore ?? 88}/100 điểm</b>.</p>
      <p style="padding-left: 18pt;">- Đề nghị của chuyên gia: <b>${review.reviewRecommendationLabel || "Đạt yêu cầu (Phê duyệt thực hiện)"}</b>.</p>
    </div>

    <!-- FOOTER SIGNATURE -->
    <table class="footer-table" style="width: 100%; margin-top: 24pt;">
      <tr>
        <td style="width: 50%; text-align: center;"></td>
        <td style="width: 50%; text-align: center;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold;">NGƯỜI ĐÁNH GIÁ</p>
          <p style="margin: 4pt 0 45pt 0; font-size: 10pt; font-style: italic;">(Ký và ghi rõ họ tên)</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">${review.reviewerDisplayName}</p>
        </td>
      </tr>
    </table>
  `;

  exportHtmlToWord({
    filename: `Phieu_danh_gia_${review.reviewerDisplayName.replace(/[^a-zA-Z0-9]/g, "_")}_${code.replace(/[^a-zA-Z0-9]/g, "_")}`,
    title: `Phiếu đánh giá - ${review.reviewerDisplayName} - ${code}`,
    contentHtml
  });
}

