import { apiRequest } from "@/lib/api-client";

/**
 * Trang điều phối đánh giá: tổng quan hồ sơ theo người xem (Trưởng phòng: mọi hồ sơ trong phạm vi; chuyên viên:
 * hồ sơ mình phụ trách) và phân công chuyên viên theo mảng (cấp đề tài × Quân sự / Dân sự).
 */

export type CoordinationRow = {
  id: string;
  code: string;
  title: string;
  ownerDisplayName: string;
  hostOrganizationUnitName: string;
  status: string;
  statusLabel: string;
  submittedAt: string;
  proposalLevel: string;
  proposalLevelLabel: string;
  militaryScope: "military" | "civilian";
  militaryScopeLabel: string;
  officer: { userId: string; displayName: string; assignedAt: string } | null;
  review: { activeCount: number; scoringCount: number; submittedCount: number; pendingInvitationCount: number; declinedCount: number; averageScore: number | null };
  councilStatus: string;
  councilMemberCount: number;
  summaryStatus: string;
};

/** head: Trưởng phòng (điều phối, giao người); department: Phó phòng/Trưởng ban (xem tất cả); officer: chuyên viên. */
export type CoordinationOverview = { viewerRole: "head" | "department" | "officer"; truncated: boolean; proposals: CoordinationRow[] };

export type PortfolioRule = { id?: string; proposalLevel: string | null; militaryScope: string | null; label?: string };

export type PortfolioOfficer = { id: string; username: string; displayName: string; unit: string; activeProposalCount: number; rules: PortfolioRule[] };

export type PortfolioList = {
  levels: Array<{ code: string; name: string }>;
  militaryScopes: Array<{ code: string; name: string }>;
  officers: PortfolioOfficer[];
};

const requestJson = <T>(path: string, init?: RequestInit) => apiRequest<T>(path, init, "Không thể xử lý yêu cầu điều phối đánh giá.");

export function loadCoordinationOverview() {
  return requestJson<CoordinationOverview>("/evaluation-coordination/overview");
}

export function loadPortfolios() {
  return requestJson<PortfolioList>("/evaluation-coordination/portfolios");
}

export function savePortfolio(officerUserId: string, rules: PortfolioRule[]) {
  return requestJson<PortfolioList>(`/evaluation-coordination/portfolios/${officerUserId}`, {
    method: "PUT",
    body: JSON.stringify({ rules: rules.map(({ proposalLevel, militaryScope }) => ({ proposalLevel, militaryScope })) })
  });
}

export function autoAssignUnassigned() {
  return requestJson<{ assigned: number; unmatched: number }>("/evaluation-coordination/auto-assign", { method: "POST", body: "{}" });
}
