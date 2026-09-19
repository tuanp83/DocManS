export type ProposalLevelCode =
  | "national-level"
  | "ministry-level"
  | "branch-level"
  | "academy-level"
  | "grassroots-level"
  | "student-level";

export type MilitaryScopeCode = "military" | "civilian" | "dual-use";

export const PROPOSAL_LEVEL_LABELS: Record<string, string> = {
  "national-level": "Cấp Quốc gia",
  "ministry-level": "Cấp Bộ Quốc phòng",
  "branch-level": "Cấp Ngành / Cục",
  "academy-level": "Cấp Học viện",
  "grassroots-level": "Cấp Cơ sở",
  "student-level": "Sinh viên / Học viên NCKH"
};

export const MILITARY_SCOPE_LABELS: Record<string, string> = {
  "military": "Quân sự - Quốc phòng",
  "civilian": "Ngoài quân đội (Dân sự)",
  "dual-use": "Lưỡng dụng (Quân - Dân y)"
};

export function getProposalLevelLabel(code?: string | null): string {
  if (!code) return "Chưa phân cấp";
  return PROPOSAL_LEVEL_LABELS[code] ?? code;
}

export function getProposalMilitaryScope(proposal: {
  proposalTypeCode?: string | null;
  researchFieldCode?: string | null;
  code?: string | null;
  title?: string;
  militaryScope?: string | null;
}): MilitaryScopeCode {
  if (
    proposal.militaryScope === "civilian" ||
    proposal.militaryScope === "dual-use" ||
    proposal.militaryScope === "military"
  ) {
    return proposal.militaryScope;
  }

  const code = (proposal.code || "").toUpperCase();
  const type = proposal.proposalTypeCode || "";
  const field = proposal.researchFieldCode || "";

  // Đề tài thuộc Bộ Quốc phòng, Cục Quân y, Học viện Quân y hoặc chuyên ngành Y học quân sự
  if (
    type === "ministry-level" ||
    type === "branch-level" ||
    type === "academy-level" ||
    code.startsWith("BQP") ||
    code.startsWith("HVQY") ||
    field === "military-medicine"
  ) {
    return "military";
  }

  // Đề tài phối hợp ngoài quân đội hoặc đề tài Nhà nước dân sự
  if (type === "national-level" && !field.includes("military")) {
    return "civilian";
  }

  // Mặc định chuẩn tại Học viện Quân y là đề tài Quân sự - Quốc phòng
  return "military";
}

export function getProposalMilitaryScopeLabel(scope: MilitaryScopeCode): string {
  return MILITARY_SCOPE_LABELS[scope] ?? scope;
}
