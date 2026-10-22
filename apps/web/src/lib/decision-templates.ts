import {
  academyUnit,
  BLANK,
  DECISION_BASES,
  decisionRecipients,
  esc,
  memberAppendix,
  officialName,
  officialNameFromDisplay,
  shortDate,
  topicClause,
  type DecisionDocument
} from "@/lib/decision-document";
import { getProposalLevelLabel } from "@/lib/proposal-classification";
import { numberToVietnameseWords } from "@/lib/vietnamese-currency";

/** Nội dung từng loại quyết định theo mẫu Phòng KHQS; thể thức chung ở decision-document.ts. */

/** Chức danh ký thay Giám đốc: Phó GĐ phụ trách Khoa học ký "KT. GIÁM ĐỐC / PHÓ GIÁM ĐỐC". */
export function directorSignatureTitle(signerRole?: string | null) {
  return signerRole === "SCIENCE_DEPUTY_DIRECTOR" ? ["KT. GIÁM ĐỐC", "PHÓ GIÁM ĐỐC"] : ["GIÁM ĐỐC"];
}

type CouncilMemberLike = {
  role?: string | null; roleLabel?: string | null; displayName?: string | null; academicTitle?: string | null; unit?: string | null; organization?: string | null;
  militaryRank?: string | null; position?: string | null; profileType?: string | null;
};

export type CouncilDecisionInput = {
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  hostOrganizationUnitName?: string | null;
  proposalTypeCode?: string | null;
  startDate?: string | null;
  councilMetadata?: {
    decisionNumber?: string | null;
    decidedAt?: string | null;
    decidedByName?: string | null;
    decidedByRole?: string | null;
    members?: CouncilMemberLike[] | null;
  } | null;
};

/** Vai trò trong Hội đồng xét duyệt và thứ tự ghi trong quyết định (mẫu QĐ 1273/QĐ-HVQY). */
const COUNCIL_ROLE_TEXT: Record<string, string> = {
  chair: "Chủ tịch Hội đồng",
  vice_chair: "Phó Chủ tịch Hội đồng",
  reviewer_1: "Ủy viên phản biện 1",
  reviewer_2: "Ủy viên phản biện 2",
  reviewer: "Ủy viên phản biện",
  member: "Ủy viên",
  secretary: "Ủy viên, Thư ký khoa học"
};
const COUNCIL_ROLE_ORDER = ["chair", "vice_chair", "reviewer_1", "reviewer_2", "reviewer", "member", "secretary"];

/** "cấp Học viện" trong trích yếu, Điều 1. */
const levelPhrase = (code?: string | null) => {
  const label = code ? getProposalLevelLabel(code) : "";
  return label && label !== "Chưa phân cấp" ? ` ${label.charAt(0).toLocaleLowerCase("vi")}${label.slice(1)}` : "";
};

const vnYear = (value?: string | null) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(value && !Number.isNaN(new Date(value).valueOf()) ? new Date(value) : new Date());

/**
 * Chức vụ, đơn vị sau họ tên như mẫu: "Phó Giám đốc Học viện Quân y"; "Trưởng phòng Khoa học Quân sự, Học viện Quân y"
 * (chức vụ đã nêu đơn vị thì không lặp); "Trưởng ban Công nghệ thông tin, Văn phòng, Học viện Quân y"; người ngoài
 * Học viện: chức vụ, cơ quan.
 */
function councilAffiliation(member: CouncilMemberLike) {
  const unit = (member.unit || member.organization || "").trim();
  const position = member.position?.trim() ?? "";
  if (member.profileType === "EXTERNAL") return [position, unit].filter(Boolean).join(", ");
  if (/học viện quân y/i.test(position)) return position;
  const mentionsUnit = !!unit && position.toLocaleLowerCase("vi").includes(unit.toLocaleLowerCase("vi"));
  return [position, mentionsUnit ? "" : unit, "Học viện Quân y"].filter(Boolean).filter((part, index, parts) => !(part === "Học viện Quân y" && parts.slice(0, index).some((item) => /học viện quân y/i.test(item)))).join(", ");
}

/** "Thiếu tướng, PGS, TS Vũ Nhất Định, Phó Giám đốc Học viện Quân y: Chủ tịch Hội đồng." */
function councilMemberLine(member: CouncilMemberLike) {
  const name = officialName({ militaryRank: member.militaryRank, titles: member.academicTitle, name: member.displayName ?? "" });
  const affiliation = councilAffiliation(member);
  const role = COUNCIL_ROLE_TEXT[member.role ?? ""] ?? member.roleLabel ?? "";
  return `${esc(name)}${affiliation ? `, ${esc(affiliation)}` : ""}: ${esc(role)}.`;
}

/** Quyết định thành lập Hội đồng xét duyệt thuyết minh nhiệm vụ KH&CN (mẫu QĐ 1273/QĐ-HVQY). */
export function councilDecisionDocument(proposal: CouncilDecisionInput): DecisionDocument {
  const council = proposal.councilMetadata ?? {};
  const members = [...(Array.isArray(council.members) ? council.members : [])].sort((left, right) => {
    const rank = (member: CouncilMemberLike) => { const index = COUNCIL_ROLE_ORDER.indexOf(member.role ?? ""); return index < 0 ? COUNCIL_ROLE_ORDER.length : index; };
    return rank(left) - rank(right);
  });
  const level = levelPhrase(proposal.proposalTypeCode);
  const year = vnYear(proposal.startDate || council.decidedAt);
  const memberLines = members.length ? members.map((member, index) => `${index + 1}. ${councilMemberLine(member)}`) : [`1. ${BLANK}: Chủ tịch Hội đồng.`];
  return {
    number: council.decisionNumber,
    date: council.decidedAt,
    subjectHtml: `Về việc thành lập Hội đồng xét duyệt thuyết minh nhiệm vụ<br/>khoa học và công nghệ${esc(level)} năm ${esc(year)}`,
    bases: [DECISION_BASES.law, DECISION_BASES.charter, DECISION_BASES.selection, DECISION_BASES.regulation, DECISION_BASES.request],
    articles: [
      [
        `Thành lập Hội đồng xét duyệt thuyết minh nhiệm vụ Khoa học và công nghệ${esc(level)} thực hiện năm ${esc(year)}:`,
        `<b>Tên đề tài:</b> ${esc(proposal.title)}.`,
        `<b>Chủ nhiệm đề tài:</b> ${esc(officialNameFromDisplay(proposal.ownerDisplayName) || BLANK)}.`,
        `<b>Đơn vị:</b> ${esc(academyUnit(proposal.hostOrganizationUnitName))}.`,
        "Học viện Quân y mời và giao nhiệm vụ cho các đồng chí sau tham gia Hội đồng:",
        ...memberLines
      ].join("\n\n"),
      [
        `Hội đồng có nhiệm vụ đánh giá, xét duyệt thuyết minh các nhiệm vụ Khoa học và công nghệ${esc(level)} thực hiện năm ${esc(year)} theo quy định hiện hành của Nhà nước và Bộ Quốc phòng.`,
        "Đồng chí Chủ tịch Hội đồng được phép ký những văn bản do Hội đồng ban hành và chịu trách nhiệm trước Giám đốc Học viện và pháp luật về những văn bản, tài liệu do mình ký.",
        "Hội đồng tự giải thể sau khi hoàn thành nhiệm vụ."
      ].join("\n\n"),
      "Trưởng phòng Khoa học Quân sự, các cơ quan đơn vị liên quan, Chủ nhiệm đề tài và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành quyết định này./."
    ],
    recipients: decisionRecipients(),
    signer: { titleLines: directorSignatureTitle(council.decidedByRole), displayName: council.decidedByName }
  };
}

export type ApprovalDecisionInput = {
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  hostOrganizationUnitName?: string | null;
  budgetMetadata?: { amount?: number | string | null; approvedAmount?: number | null } | null;
  startDate?: string | null;
  endDate?: string | null;
  signerName?: string | null;
  decisions?: Array<{ decision: string; decidedAt?: string | null; decisionNumber?: string | null; decidedByDisplayName?: string | null }> | null;
};

/** Quyết định phê duyệt đề tài và kinh phí thực hiện. */
export function approvalDecisionDocument(proposal: ApprovalDecisionInput): DecisionDocument {
  const approved = proposal.decisions?.find((item) => item.decision === "approved");
  const amount = Number(proposal.budgetMetadata?.approvedAmount || proposal.budgetMetadata?.amount || 0);
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(approved?.decidedAt ? new Date(approved.decidedAt) : new Date());
  const money = amount > 0 ? `${new Intl.NumberFormat("vi-VN").format(amount)} đồng <i>(Bằng chữ: ${esc(numberToVietnameseWords(amount))})</i>` : `${BLANK} đồng`;
  return {
    number: approved?.decisionNumber,
    date: approved?.decidedAt,
    subjectHtml: `Về việc phê duyệt đề tài và kinh phí thực hiện đề tài: “${esc(proposal.title)}”; Mã số: ${esc(proposal.code || BLANK)}`,
    bases: [DECISION_BASES.law, DECISION_BASES.charter, DECISION_BASES.selection, DECISION_BASES.regulation, DECISION_BASES.proposal(proposal.title), "Căn cứ Biên bản họp và Kết luận của Hội đồng xét duyệt thuyết minh đề tài;", DECISION_BASES.request],
    articles: [
      `Phê duyệt đề tài: ${topicClause({ title: proposal.title, code: proposal.code, piName: proposal.ownerDisplayName, unitName: proposal.hostOrganizationUnitName })}; Thời gian thực hiện: từ ${esc(shortDate(proposal.startDate))} đến ${esc(shortDate(proposal.endDate))}.`,
      `Kinh phí thực hiện đề tài: ${money}, từ nguồn ngân sách sự nghiệp khoa học quân sự năm ${year}. Việc quản lý, sử dụng và thanh quyết toán kinh phí thực hiện theo quy định hiện hành của Nhà nước và Bộ Quốc phòng.`,
      "Chủ nhiệm đề tài có trách nhiệm tổ chức thực hiện đề tài theo đúng thuyết minh đã được phê duyệt, bảo đảm tiến độ, chất lượng; Phòng Khoa học Quân sự, Phòng Tài chính có trách nhiệm hướng dẫn, theo dõi, kiểm tra việc thực hiện và sử dụng kinh phí của đề tài.",
      "Quyết định này có hiệu lực kể từ ngày ký.\n\nTrưởng phòng Khoa học Quân sự, Trưởng phòng Tài chính, các cơ quan đơn vị liên quan và Chủ nhiệm đề tài chịu trách nhiệm thi hành quyết định này./."
    ],
    recipients: decisionRecipients(["Phòng Tài chính;"]),
    signer: { titleLines: ["GIÁM ĐỐC"], displayName: proposal.signerName ?? approved?.decidedByDisplayName }
  };
}

export type ProductPanelDecisionInput = {
  project: { code?: string | null; title: string; piName?: string | null; unitName?: string | null };
  products: Array<{ title: string; productForm: number; requirements?: string | null }>;
  members: Array<{ fullName: string; academicTitle?: string | null; unit?: string | null; role: "LEADER" | "MEMBER" }>;
  reviewDate?: string | null;
  location?: string | null;
};

/** Quyết định thành lập Tổ thẩm định, đánh giá sản phẩm KH&CN của đề tài (mẫu QĐ 4626/QĐ-HVQY). */
export function productPanelDecisionDocument(input: ProductPanelDecisionInput): DecisionDocument {
  const { project } = input;
  const leaderFirst = [...input.members].sort((left, right) => (left.role === "LEADER" ? 0 : 1) - (right.role === "LEADER" ? 0 : 1));
  const meeting = input.reviewDate || input.location
    ? `\n\nThời gian, địa điểm thẩm định: ${input.reviewDate ? `ngày ${esc(shortDate(input.reviewDate))}` : BLANK}${input.location ? ` tại ${esc(input.location)}` : ""}.`
    : "";
  return {
    subjectHtml: `Về việc thành lập Tổ thẩm định, đánh giá sản phẩm KH&amp;CN của đề tài: “${esc(project.title)}”; Mã số: ${esc(project.code || BLANK)}`,
    bases: [DECISION_BASES.charter, DECISION_BASES.regulation, DECISION_BASES.proposal(project.title), DECISION_BASES.contract, DECISION_BASES.request],
    articles: [
      `Thành lập Tổ thẩm định, đánh giá sản phẩm KH&amp;CN của đề tài: ${topicClause({ title: project.title, code: project.code, piName: project.piName, unitName: project.unitName })} <i>(Danh sách Phụ lục I kèm theo)</i>.`,
      `Tổ có nhiệm vụ thẩm định, đánh giá sản phẩm KH&amp;CN của đề tài <i>(Danh mục sản phẩm Phụ lục II kèm theo)</i> theo thuyết minh đề cương theo quy định hiện hành của Nhà nước và Bộ Quốc phòng; Tổ tự giải thể sau khi hoàn thành nhiệm vụ.${meeting}\n\nĐồng chí Tổ trưởng chịu trách nhiệm trước Giám đốc Học viện và pháp luật về văn bản, tài liệu do mình ký.`,
      "Phòng Khoa học Quân sự, Chủ nhiệm đề tài có trách nhiệm chuẩn bị đầy đủ hồ sơ và các điều kiện để Tổ làm việc đạt kết quả.",
      "Quyết định này có hiệu lực kể từ ngày ký.\n\nĐồng chí Trưởng phòng Khoa học Quân sự, Chủ nhiệm đề tài và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành quyết định này./."
    ],
    recipients: decisionRecipients(),
    signer: { titleLines: ["GIÁM ĐỐC"] },
    appendices: [
      memberAppendix("Phụ lục I", "DANH SÁCH TỔ THẨM ĐỊNH, ĐÁNH GIÁ SẢN PHẨM KH&CN", leaderFirst.map((member) => ({ name: member.fullName, academicTitle: member.academicTitle, unit: member.unit, role: member.role === "LEADER" ? "Tổ trưởng" : "Thành viên" })), "Nhiệm vụ trong Tổ"),
      {
        label: "Phụ lục II",
        title: "DANH MỤC SẢN PHẨM KH&CN CỦA ĐỀ TÀI",
        headers: [{ label: "TT", width: 6 }, { label: "Tên sản phẩm", width: 44 }, { label: "Dạng sản phẩm", width: 14 }, { label: "Yêu cầu khoa học", width: 36 }],
        rows: input.products.map((product, index) => [String(index + 1), esc(product.title), `Dạng ${product.productForm}`, esc(product.requirements || "")]),
        emptyText: "Chưa có danh mục sản phẩm."
      }
    ]
  };
}
