/**
 * Quyết định của Giám đốc Học viện theo mẫu Phòng KHQS (QĐ 4626/QĐ-HVQY ngày 09/9/2026 thành lập Tổ thẩm định):
 * quốc hiệu, số "…/QĐ-HVQY", trích yếu nêu tên và mã số đề tài, các căn cứ, Điều 1–4, nơi nhận, người ký
 * (chức danh, cấp bậc họ tên) và các phụ lục trang riêng. Một HTML dùng cho cả xem / in trên trình duyệt lẫn Word.
 * Chưa có số, ngày, người ký thì để trống cho văn thư, người ký điền; không điền dữ liệu giả.
 */

export const BLANK = "…………………………";

export function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Căn cứ dùng chung của các quyết định KH&CN (theo mẫu). */
export const DECISION_BASES = {
  charter: "Căn cứ Thông tư số 14/2022/TT-BQP ngày 01/02/2022 của Bộ Quốc phòng Ban hành Điều lệ Công tác khoa học và công nghệ Quân đội nhân dân Việt Nam;",
  regulation: "Căn cứ Quy chế quản lý hoạt động khoa học và công nghệ số 5379/QC-HVQY ngày 23/12/2023 của Học viện Quân y;",
  proposal: (title: string) => `Căn cứ Thuyết minh đề tài: “${title}”;`,
  contract: `Căn cứ Hợp đồng số ${BLANK} ngày ${BLANK} giữa Học viện Quân y với nhóm nghiên cứu;`,
  request: "Theo đề nghị của Trưởng phòng Khoa học Quân sự."
};

/** Nơi nhận theo mẫu; `members` là dòng thành viên (Hội đồng / Tổ thẩm định). */
export function decisionRecipients(members?: string, extra: string[] = []) {
  return ["Đ/c Giám đốc, Chính ủy HV;", `Đ/c PGĐHV: ${BLANK};`, ...(members ? [`${members};`] : []), ...extra, "J6, Chủ nhiệm đề tài;", "Lưu: VT, QLKHQS/J6."];
}

const TITLE_TOKEN = /^(?:GS|PGS|TS|TSKH|ThS|BS|BSCKI{1,2}|CN|KS|DS)\.?$/i;

/**
 * Dòng người ký: cấp bậc và họ tên, bỏ học hàm, học vị ("Trung tướng, GS. TS. Trần Viết Tiến" → "Trung tướng
 * Trần Viết Tiến"), như mẫu. Tên hiển thị của tài khoản đồng bộ theo lý lịch khoa học (cấp bậc, học hàm, họ tên).
 */
export function signerLine(displayName?: string | null) {
  const value = displayName?.trim();
  if (!value) return "";
  const [rank, rest] = value.includes(",") ? [value.slice(0, value.indexOf(",")).trim(), value.slice(value.indexOf(",") + 1).trim()] : ["", value];
  const name = rest.split(/\s+/).filter((token) => !TITLE_TOKEN.test(token)).join(" ");
  return rank ? `${rank} ${name}` : name;
}

/** "Số: 4626 /QĐ-HVQY": số văn thư cấp đã có ký hiệu thì giữ nguyên, chỉ có số thì thêm ký hiệu, chưa có thì để trống. */
export function decisionNumberLine(number?: string | null) {
  const value = number?.trim();
  if (!value) return "Số:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/QĐ-HVQY";
  return `Số: ${esc(/\//.test(value) ? value : `${value} /QĐ-HVQY`)}`;
}

/** "Hà Nội, ngày 09 tháng 9 năm 2026"; chưa ký thì để trống ngày, tháng. */
export function decisionDateLine(date?: Date | string | null, place = "Hà Nội") {
  const value = date ? new Date(date) : null;
  if (!value || Number.isNaN(value.valueOf())) {
    const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(new Date());
    return `${esc(place)}, ngày&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tháng&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; năm ${year}`;
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "numeric", year: "numeric" }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${esc(place)}, ngày ${parts.day} tháng ${parts.month} năm ${parts.year}`;
}

/** Ngày dạng 01/7/2026 trong thân văn bản. */
export function shortDate(value?: string | null) {
  if (!value) return BLANK;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.valueOf()) ? BLANK : new Intl.DateTimeFormat("vi-VN", { timeZone: value.length === 10 ? "UTC" : "Asia/Ho_Chi_Minh", day: "2-digit", month: "numeric", year: "numeric" }).format(date);
}

/** "Đề tài: “…”; Mã số: …; Chủ nhiệm đề tài: …; Đơn vị: …/Học viện Quân y" — đã escape. */
export function topicClause(input: { title: string; code?: string | null; piName?: string | null; unitName?: string | null }) {
  const unit = input.unitName?.trim();
  const unitText = !unit ? BLANK : /học viện quân y/i.test(unit) ? unit : `${unit}/Học viện Quân y`;
  return `“${esc(input.title)}”; Mã số: ${esc(input.code || BLANK)}; Chủ nhiệm đề tài: ${esc(input.piName || BLANK)}; Đơn vị: ${esc(unitText)}`;
}

export type DecisionAppendix = { label: string; title: string; headers: Array<{ label: string; width?: number }>; rows: string[][]; emptyText?: string };

export type DecisionDocument = {
  number?: string | null;
  date?: Date | string | null;
  /** Trích yếu, chữ thường (đã escape bên trong): "Về việc thành lập Tổ thẩm định … của đề tài: “…”; Mã số: …". */
  subjectHtml: string;
  /** Các căn cứ, chữ thường. */
  bases: string[];
  /** Nội dung từng điều (HTML đã escape), không gồm "Điều n."; mỗi phần tử là một đoạn hoặc nhiều đoạn nối bằng `\n\n`. */
  articles: string[];
  recipients: string[];
  signer: { titleLines: string[]; displayName?: string | null };
  appendices?: DecisionAppendix[];
};

const P = (html: string, style = "") => `<p style="margin: 0 0 6pt 0; text-indent: 1cm; text-align: justify;${style}">${html}</p>`;

function appendixHtml(appendix: DecisionAppendix, doc: DecisionDocument) {
  const number = doc.number?.trim() ? esc(/\//.test(doc.number) ? doc.number : `${doc.number}/QĐ-HVQY`) : `${BLANK}/QĐ-HVQY`;
  const date = doc.date ? shortDate(typeof doc.date === "string" ? doc.date : doc.date.toISOString()) : BLANK;
  const head = appendix.headers.map((header) => `<th${header.width ? ` style="width: ${header.width}%;"` : ""}>${esc(header.label)}</th>`).join("");
  const body = appendix.rows.length
    ? appendix.rows.map((row) => `<tr>${row.map((cell, index) => `<td style="text-align: ${index === 0 ? "center" : "left"};">${cell}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${appendix.headers.length}" style="text-align: center; font-style: italic;">${esc(appendix.emptyText ?? "")}</td></tr>`;
  return `
    <div style="page-break-before: always;">
      <div style="text-align: center;">
        <p style="margin: 0; font-weight: bold;">${esc(appendix.label)}</p>
        <p style="margin: 0; font-weight: bold;">${esc(appendix.title)}</p>
        <p style="margin: 0 0 12pt 0; font-style: italic;">(Kèm theo Quyết định số ${number} ngày ${date} của Giám đốc Học viện Quân y)</p>
      </div>
      <table class="border-table" style="width: 100%;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
}

export function buildDecisionHtml(doc: DecisionDocument) {
  const signer = signerLine(doc.signer.displayName);
  const articles = doc.articles.map((article, index) => {
    const [first, ...rest] = article.split("\n\n");
    return P(`<b>Điều ${index + 1}.</b> ${first}`) + rest.map((paragraph) => P(paragraph)).join("");
  }).join("");
  return `
    <table class="header-table" style="width: 100%; margin-bottom: 12pt;">
      <tr>
        <td style="width: 40%; text-align: center;">
          <p style="margin: 0; font-size: 13pt;">BỘ QUỐC PHÒNG</p>
          <p style="margin: 0; font-size: 13pt; font-weight: bold; text-decoration: underline;">HỌC VIỆN QUÂN Y</p>
          <p style="margin: 6pt 0 0 0; font-size: 13pt;">${decisionNumberLine(doc.number)}</p>
        </td>
        <td style="width: 60%; text-align: center;">
          <p style="margin: 0; font-size: 13pt; font-weight: bold;">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="margin: 0; font-size: 14pt; font-weight: bold; text-decoration: underline;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="margin: 6pt 0 0 0; font-size: 14pt; font-style: italic;">${decisionDateLine(doc.date)}</p>
        </td>
      </tr>
    </table>
    <div style="text-align: center;">
      <p style="margin: 12pt 0 0 0; font-size: 14pt; font-weight: bold;">QUYẾT ĐỊNH</p>
      <p style="margin: 0 0 10pt 0; font-size: 14pt; font-weight: bold;">${doc.subjectHtml}</p>
      <p style="margin: 0 0 10pt 0; font-size: 14pt; font-weight: bold;">GIÁM ĐỐC HỌC VIỆN QUÂN Y</p>
    </div>
    ${doc.bases.map((basis) => P(esc(basis), " font-style: italic;")).join("")}
    <div style="text-align: center;"><p style="margin: 10pt 0; font-size: 14pt; font-weight: bold;">QUYẾT ĐỊNH:</p></div>
    ${articles}
    <table class="footer-table" style="width: 100%; margin-top: 16pt;">
      <tr>
        <td style="width: 45%; text-align: left;">
          <p style="margin: 0; font-size: 12pt; font-weight: bold; font-style: italic;">Nơi nhận:</p>
          ${doc.recipients.map((line) => `<p style="margin: 0; font-size: 11pt;">- ${esc(line)}</p>`).join("")}
        </td>
        <td style="width: 55%; text-align: center;">
          ${doc.signer.titleLines.map((line) => `<p style="margin: 0; font-size: 14pt; font-weight: bold;">${esc(line)}</p>`).join("")}
          <p style="margin: 0;">&nbsp;</p><p style="margin: 0;">&nbsp;</p><p style="margin: 0;">&nbsp;</p><p style="margin: 0;">&nbsp;</p>
          <p style="margin: 0; font-size: 14pt; font-weight: bold;">${signer ? esc(signer) : "&nbsp;"}</p>
        </td>
      </tr>
    </table>
    ${(doc.appendices ?? []).map((appendix) => appendixHtml(appendix, doc)).join("")}`;
}

/** Bảng thành viên dùng cho Phụ lục I. */
export function memberAppendix(label: string, title: string, members: Array<{ name: string; academicTitle?: string | null; unit?: string | null; role: string }>, roleHeader: string): DecisionAppendix {
  return {
    label,
    title,
    headers: [{ label: "TT", width: 6 }, { label: "Họ và tên", width: 30 }, { label: "Học hàm, học vị", width: 16 }, { label: "Đơn vị công tác", width: 28 }, { label: roleHeader, width: 20 }],
    rows: members.map((member, index) => [String(index + 1), `<b>${esc(member.name)}</b>`, esc(member.academicTitle || ""), esc(member.unit || "Học viện Quân y"), esc(member.role)]),
    emptyText: "Chưa có danh sách thành viên."
  };
}
