import {
  BLANK,
  DECISION_BASES,
  decisionRecipients,
  esc,
  memberAppendix,
  shortDate,
  topicClause,
  type DecisionDocument
} from "@/lib/decision-document";
import { numberToVietnameseWords } from "@/lib/vietnamese-currency";

/** Nội dung từng loại quyết định theo mẫu Phòng KHQS; thể thức chung ở decision-document.ts. */

/** Chức danh ký thay Giám đốc: Phó GĐ phụ trách Khoa học ký "KT. GIÁM ĐỐC / PHÓ GIÁM ĐỐC". */
export function directorSignatureTitle(signerRole?: string | null) {
  return signerRole === "SCIENCE_DEPUTY_DIRECTOR" ? ["KT. GIÁM ĐỐC", "PHÓ GIÁM ĐỐC"] : ["GIÁM ĐỐC"];
}

type CouncilMemberLike = { displayName?: string | null; academicTitle?: string | null; unit?: string | null; organization?: string | null; roleLabel?: string | null; role?: string | null };

export type CouncilDecisionInput = {
  code?: string | null;
  title: string;
  ownerDisplayName?: string | null;
  hostOrganizationUnitName?: string | null;
  councilMetadata?: {
    decisionNumber?: string | null;
    decidedAt?: string | null;
    decidedByName?: string | null;
    decidedByRole?: string | null;
    meetingDate?: string | null;
    meetingLocation?: string | null;
    members?: CouncilMemberLike[] | null;
  } | null;
};

/** Quyết định thành lập Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài. */
export function councilDecisionDocument(proposal: CouncilDecisionInput): DecisionDocument {
  const council = proposal.councilMetadata ?? {};
  const members = Array.isArray(council.members) ? council.members : [];
  const topic = topicClause({ title: proposal.title, code: proposal.code, piName: proposal.ownerDisplayName, unitName: proposal.hostOrganizationUnitName });
  const meeting = council.meetingDate || council.meetingLocation
    ? `\n\nThời gian, địa điểm họp Hội đồng: ${council.meetingDate ? `ngày ${esc(shortDate(council.meetingDate))}` : BLANK}${council.meetingLocation ? ` tại ${esc(council.meetingLocation)}` : ""}.`
    : "";
  return {
    number: council.decisionNumber,
    date: council.decidedAt,
    subjectHtml: `Về việc thành lập Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài: “${esc(proposal.title)}”; Mã số: ${esc(proposal.code || BLANK)}`,
    bases: [DECISION_BASES.charter, DECISION_BASES.regulation, DECISION_BASES.proposal(proposal.title), DECISION_BASES.request],
    articles: [
      `Thành lập Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài: ${topic} <i>(Danh sách Phụ lục I kèm theo)</i>.`,
      `Hội đồng có nhiệm vụ tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài theo quy định hiện hành của Nhà nước và Bộ Quốc phòng; Hội đồng tự giải thể sau khi hoàn thành nhiệm vụ.${meeting}\n\nĐồng chí Chủ tịch Hội đồng chịu trách nhiệm trước Giám đốc Học viện và pháp luật về văn bản, tài liệu do mình ký.`,
      "Phòng Khoa học Quân sự, Chủ nhiệm đề tài có trách nhiệm chuẩn bị đầy đủ hồ sơ và các điều kiện để Hội đồng làm việc đạt kết quả.",
      "Quyết định này có hiệu lực kể từ ngày ký.\n\nĐồng chí Trưởng phòng Khoa học Quân sự, Chủ nhiệm đề tài và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành quyết định này./."
    ],
    recipients: decisionRecipients("Thành viên Hội đồng"),
    signer: { titleLines: directorSignatureTitle(council.decidedByRole), displayName: council.decidedByName },
    appendices: [memberAppendix("Phụ lục I", "DANH SÁCH HỘI ĐỒNG TƯ VẤN TUYỂN CHỌN, ĐÁNH GIÁ XÉT DUYỆT THUYẾT MINH ĐỀ TÀI", members.map((member) => ({ name: member.displayName ?? "", academicTitle: member.academicTitle, unit: member.unit || member.organization, role: member.roleLabel || member.role || "" })), "Trách nhiệm trong Hội đồng")]
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
    bases: [DECISION_BASES.charter, DECISION_BASES.regulation, DECISION_BASES.proposal(proposal.title), "Căn cứ Biên bản họp và Kết luận của Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài;", DECISION_BASES.request],
    articles: [
      `Phê duyệt đề tài: ${topicClause({ title: proposal.title, code: proposal.code, piName: proposal.ownerDisplayName, unitName: proposal.hostOrganizationUnitName })}; Thời gian thực hiện: từ ${esc(shortDate(proposal.startDate))} đến ${esc(shortDate(proposal.endDate))}.`,
      `Kinh phí thực hiện đề tài: ${money}, từ nguồn ngân sách sự nghiệp khoa học quân sự năm ${year}. Việc quản lý, sử dụng và thanh quyết toán kinh phí thực hiện theo quy định hiện hành của Nhà nước và Bộ Quốc phòng.`,
      "Chủ nhiệm đề tài có trách nhiệm tổ chức thực hiện đề tài theo đúng thuyết minh đã được phê duyệt, bảo đảm tiến độ, chất lượng; Phòng Khoa học Quân sự, Phòng Tài chính có trách nhiệm hướng dẫn, theo dõi, kiểm tra việc thực hiện và sử dụng kinh phí của đề tài.",
      "Quyết định này có hiệu lực kể từ ngày ký.\n\nĐồng chí Trưởng phòng Khoa học Quân sự, Trưởng phòng Tài chính, Chủ nhiệm đề tài và các cơ quan, đơn vị liên quan chịu trách nhiệm thi hành quyết định này./."
    ],
    recipients: decisionRecipients(undefined, ["Phòng Tài chính;"]),
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
    recipients: decisionRecipients("Thành viên Tổ Thẩm định"),
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
