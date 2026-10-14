import { BadRequestException } from "@nestjs/common";
import { MANAGEMENT_OFFICER_STATUS } from "./proposal-management-officer.service.js";

/**
 * Phân công chuyên viên QLKH theo mảng đề tài. Mảng của một hồ sơ = cấp đề tài (mã loại đề tài: cấp Cơ sở, Bộ,
 * Nhà nước, Học viên NCKH…) × tính chất (Quân sự / Dân sự). Trưởng phòng giao cho mỗi chuyên viên một hoặc nhiều
 * quy tắc; một quy tắc có thể chỉ nêu cấp, chỉ nêu tính chất, hoặc cả hai (tổ hợp).
 */

export const MILITARY_SCOPES = ["military", "civilian"] as const;
export type MilitaryScope = (typeof MILITARY_SCOPES)[number];
export const MILITARY_SCOPE_LABELS: Record<MilitaryScope, string> = { military: "Quân sự", civilian: "Dân sự" };

export type PortfolioRule = { proposalLevel: string | null; militaryScope: string | null };

/** Tính chất mặc định khi chưa chọn: đề tài cấp Nhà nước ngoài lĩnh vực quân sự là Dân sự, còn lại là Quân sự. */
export function defaultMilitaryScope(proposal: { proposalTypeCode?: string | null; researchFieldCode?: string | null }): MilitaryScope {
  return proposal.proposalTypeCode === "national-level" && !(proposal.researchFieldCode ?? "").includes("military") ? "civilian" : "military";
}

export function readMilitaryScope(value: unknown): MilitaryScope | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !(MILITARY_SCOPES as readonly string[]).includes(value)) {
    throw new BadRequestException({ message: "Tính chất đề tài phải là Quân sự hoặc Dân sự." });
  }
  return value as MilitaryScope;
}

/**
 * Mức khớp của một quy tắc với hồ sơ: -1 = không khớp; 0 = quy tắc "mọi mảng"; 1 = khớp một tiêu chí; 2 = khớp
 * cả cấp và tính chất. Quy tắc cụ thể hơn được ưu tiên khi nhiều chuyên viên cùng khớp.
 */
export function ruleSpecificity(rule: PortfolioRule, proposal: { proposalTypeCode?: string | null; militaryScope?: string | null }) {
  if (rule.proposalLevel && rule.proposalLevel !== proposal.proposalTypeCode) return -1;
  if (rule.militaryScope && rule.militaryScope !== proposal.militaryScope) return -1;
  return (rule.proposalLevel ? 1 : 0) + (rule.militaryScope ? 1 : 0);
}

// Kiểu lỏng có chủ ý: chạy với client giao dịch Prisma và CSDL giả lập trong test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PortfolioClient = any;

type CandidateRow = {
  officerUserId: string;
  proposalLevel: string | null;
  militaryScope: string | null;
  officer?: {
    id: string;
    status: string;
    systemRole: string | null;
    organizationScopes?: Array<{ organizationUnitId: string; organizationUnit?: { status: string } | null }>;
  } | null;
};

type AutoAssignProposal = {
  id: string;
  ownerId: string;
  hostOrganizationUnitId: string;
  proposalTypeCode?: string | null;
  militaryScope?: string | null;
};

/**
 * Chọn chuyên viên phụ trách cho hồ sơ theo mảng: chuyên viên đang hoạt động, có phạm vi đơn vị chủ trì, không
 * tham gia đề tài; ưu tiên quy tắc cụ thể nhất, rồi người đang phụ trách ít hồ sơ nhất. Không ai khớp → null.
 */
export async function pickPortfolioOfficer(client: PortfolioClient, proposal: AutoAssignProposal, excludedUserIds: Set<string>) {
  if (!client.managementPortfolio?.findMany) return null;
  const rows = (await client.managementPortfolio.findMany({
    include: { officer: { select: { id: true, status: true, systemRole: true, organizationScopes: { select: { organizationUnitId: true, organizationUnit: { select: { status: true } } } } } } }
  })) as CandidateRow[];
  const best = new Map<string, number>();
  for (const row of rows) {
    const officer = row.officer;
    if (!officer || officer.status !== "active" || officer.systemRole !== "RESEARCH_MANAGEMENT_STAFF" || excludedUserIds.has(officer.id)) continue;
    const inScope = (officer.organizationScopes ?? []).some((scope) => scope.organizationUnitId === proposal.hostOrganizationUnitId && scope.organizationUnit?.status === "active");
    if (!inScope) continue;
    const score = ruleSpecificity(row, proposal);
    if (score > (best.get(officer.id) ?? -1)) best.set(officer.id, score);
  }
  if (!best.size) return null;
  const top = Math.max(...best.values());
  const tied = [...best.entries()].filter(([, score]) => score === top).map(([id]) => id);
  if (tied.length === 1) return tied[0]!;
  const load = new Map<string, number>();
  for (const id of tied) {
    load.set(id, client.proposalManagementOfficer?.count ? await client.proposalManagementOfficer.count({ where: { officerUserId: id, status: MANAGEMENT_OFFICER_STATUS.active } }) : 0);
  }
  return tied.sort((left, right) => (load.get(left)! - load.get(right)!) || left.localeCompare(right))[0]!;
}

/**
 * Tự giao chuyên viên phụ trách theo mảng nếu hồ sơ chưa có người phụ trách. Chạy trong giao dịch của thao tác
 * gọi (nộp hồ sơ, giao hàng loạt). Trả về id chuyên viên đã giao, hoặc null nếu đã có người / không ai khớp.
 */
export async function autoAssignPortfolioOfficer(client: PortfolioClient, proposal: AutoAssignProposal, actorId: string, now: Date, excludedUserIds: Set<string>) {
  if (!client.proposalManagementOfficer?.create) return null;
  const active = (await client.proposalManagementOfficer.findMany({ where: { proposalId: proposal.id, status: MANAGEMENT_OFFICER_STATUS.active } })) as Array<{ effectiveUntil: Date | null }>;
  if (active.some((row) => !row.effectiveUntil || row.effectiveUntil > now)) return null;
  const officerUserId = await pickPortfolioOfficer(client, proposal, new Set([...excludedUserIds, proposal.ownerId]));
  if (!officerUserId) return null;
  const record = await client.proposalManagementOfficer.create({
    data: {
      proposalId: proposal.id,
      officerUserId,
      assignedById: actorId,
      status: MANAGEMENT_OFFICER_STATUS.active,
      effectiveFrom: now,
      effectiveUntil: null,
      reason: "Hệ thống tự giao theo mảng phụ trách"
    }
  });
  await client.researchProposal.update({
    where: { id: proposal.id },
    data: { authorizationDelegationVersion: { increment: 1 }, authorizationContextUpdatedAt: now }
  });
  await client.auditLog.create({
    data: {
      action: "auto-assign-proposal-management-officer",
      result: "success",
      actorId,
      targetEntity: "proposal-management-officer",
      targetEntityId: record.id,
      reason: JSON.stringify({ proposalId: proposal.id, officerUserId, proposalLevel: proposal.proposalTypeCode ?? null, militaryScope: proposal.militaryScope ?? null })
    }
  });
  return officerUserId as string;
}
