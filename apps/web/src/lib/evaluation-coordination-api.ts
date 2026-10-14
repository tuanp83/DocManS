import { getApiBaseUrl } from "@/lib/session";

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

export type CoordinationOverview = { viewerRole: "head" | "officer"; truncated: boolean; proposals: CoordinationRow[] };

export type PortfolioRule = { id?: string; proposalLevel: string | null; militaryScope: string | null; label?: string };

export type PortfolioOfficer = { id: string; username: string; displayName: string; unit: string; activeProposalCount: number; rules: PortfolioRule[] };

export type PortfolioList = {
  levels: Array<{ code: string; name: string }>;
  militaryScopes: Array<{ code: string; name: string }>;
  officers: PortfolioOfficer[];
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw Object.assign(new Error("Không kết nối được tới máy chủ. Kiểm tra kết nối và thử lại."), { status: 0 });
  }
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw Object.assign(new Error(body.message ?? "Không thể xử lý yêu cầu điều phối đánh giá."), { status: response.status });
  return body as T;
}

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
