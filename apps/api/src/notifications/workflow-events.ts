/**
 * Sự kiện nghiệp vụ cần thông báo (trong ứng dụng và qua email).
 *
 * Thông báo luôn được phát SAU khi giao dịch nghiệp vụ đã commit: các service gom sự kiện trong lúc xử lý
 * rồi gọi `NotificationsService.dispatch` khi giao dịch thành công, nên không có thông báo "ma" cho một
 * thao tác đã bị huỷ. Lỗi gửi thông báo không bao giờ làm hỏng thao tác nghiệp vụ.
 */
export type WorkflowEvent = {
  type: string;
  userIds: Array<string | null | undefined>;
  title: string;
  message: string;
  link?: string;
  /** Khoá chống gửi trùng cho từng người nhận (ví dụ nhắc hạn theo mốc). */
  dedupKey?: string;
  metadata?: Record<string, unknown>;
  /** Không gửi cho chính người thực hiện thao tác. */
  excludeUserIds?: Array<string | null | undefined>;
};

export const NOTIFICATION_TYPES = {
  proposalSubmitted: "PROPOSAL_SUBMITTED",
  proposalSubmissionReceipt: "PROPOSAL_SUBMISSION_RECEIPT",
  proposalResubmitted: "PROPOSAL_RESUBMITTED",
  reviewInvitation: "INVITATION_TO_REVIEW",
  supplementRequested: "SUPPLEMENT_REQUESTED",
  supplementDue: "SUPPLEMENT_DUE",
  proposalDecision: "PROPOSAL_DECISION",
  reportDue: "REPORT_DUE",
  reportOverdue: "REPORT_OVERDUE",
  projectReportSubmitted: "PROJECT_REPORT_SUBMITTED",
  projectReportSupplement: "PROJECT_REPORT_SUPPLEMENT",
  projectRequestSupplement: "PROJECT_REQUEST_SUPPLEMENT",
  projectRequestAwaitingDecision: "PROJECT_REQUEST_AWAITING_DECISION",
  projectRequestDecision: "PROJECT_REQUEST_DECISION",
  acceptanceSubmitted: "ACCEPTANCE_SUBMITTED",
  acceptanceReturned: "ACCEPTANCE_RETURNED",
  acceptanceCouncilProposed: "ACCEPTANCE_COUNCIL_PROPOSED",
  acceptanceCouncilEstablished: "ACCEPTANCE_COUNCIL_ESTABLISHED",
  acceptanceResult: "ACCEPTANCE_RESULT",
  acceptanceRevision: "ACCEPTANCE_REVISION",
  liquidationPrepared: "LIQUIDATION_PREPARED",
  liquidationApproved: "LIQUIDATION_APPROVED",
  projectClosed: "PROJECT_CLOSED",
  disbursementUpdate: "DISBURSEMENT_UPDATE",
  productSubmitted: "PRODUCT_SUBMITTED",
  productPanelFormed: "PRODUCT_PANEL_FORMED",
  productResult: "PRODUCT_RESULT",
  superiorRequestDue: "SUPERIOR_REQUEST_DUE",
  superiorRequestOverdue: "SUPERIOR_REQUEST_OVERDUE",
  superiorRequestSent: "SUPERIOR_REQUEST_SENT"
} as const;

export const RESEARCH_MANAGEMENT_ROLES = ["RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_HEAD"];
export const LEADERSHIP_ROLE = "LEADERSHIP_APPROVAL_AUTHORITY";

// Kiểu lỏng có chủ ý: dùng được cả với PrismaService, client giao dịch và CSDL giả lập trong test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserReader = { user: { findMany: (...args: any[]) => Promise<any> } };

/** Cán bộ QLKH (chuyên viên, trưởng phòng) đang hoạt động có phạm vi đơn vị chủ trì. */
export async function researchManagersInScope(client: UserReader, organizationUnitId: string): Promise<string[]> {
  const rows = (await client.user.findMany({
    where: { status: "active", systemRole: { in: RESEARCH_MANAGEMENT_ROLES }, organizationScopes: { some: { organizationUnitId } } },
    select: { id: true }
  })) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

/** Lãnh đạo Học viện đang hoạt động (người quyết định phê duyệt). */
export async function leadershipUserIds(client: UserReader): Promise<string[]> {
  const rows = (await client.user.findMany({ where: { status: "active", systemRole: LEADERSHIP_ROLE }, select: { id: true } })) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export function proposalLink(proposalId: string) {
  return `/proposals/${encodeURIComponent(proposalId)}`;
}

export function projectLink(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function label(record: { code?: string | null; title?: string | null }) {
  const title = (record.title ?? "").trim() || "(chưa đặt tên)";
  return record.code ? `${record.code} – ${title}` : title;
}

/** Ngày theo lịch Việt Nam, dd/mm/yyyy. */
export function vnDate(value: Date | string | null | undefined) {
  if (!value) return "không đặt hạn";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "không đặt hạn";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Danh sách người nhận: bỏ trống, bỏ trùng, bỏ người bị loại trừ. */
export function recipientsOf(event: WorkflowEvent): string[] {
  const excluded = new Set((event.excludeUserIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0));
  const unique = new Set<string>();
  for (const id of event.userIds) if (typeof id === "string" && id.length > 0 && !excluded.has(id)) unique.add(id);
  return [...unique];
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Liên kết tuyệt đối cho email. Gốc lấy từ APP_BASE_URL, nếu không có thì từ ACCOUNT_LOGIN_URL. Chỉ nhận
 * đường dẫn nội bộ bắt đầu bằng "/" (không cho email trỏ ra trang ngoài); thiếu cấu hình thì bỏ liên kết.
 */
export function absoluteLink(link: string | undefined, env: Record<string, string | undefined> = process.env) {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return "";
  // APP_BASE_URL là gốc ứng dụng (giữ cả đường dẫn con, ví dụ https://host/docmans); ACCOUNT_LOGIN_URL là trang
  // đăng nhập (…/login) nên gốc là thư mục chứa trang đó.
  const bases: string[] = [];
  if (env.APP_BASE_URL) bases.push(env.APP_BASE_URL.replace(/\/+$/, "") + "/");
  if (env.ACCOUNT_LOGIN_URL) bases.push(env.ACCOUNT_LOGIN_URL.replace(/[^/]*$/, ""));
  for (const base of bases) {
    try {
      const url = new URL(base);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      return new URL(link.slice(1), url).toString();
    } catch {
      continue;
    }
  }
  return "";
}

export function renderNotificationEmail(input: { title: string; message: string; link?: string }, env: Record<string, string | undefined> = process.env) {
  const href = absoluteLink(input.link, env);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c3e50;">Thông báo từ DocManS</h2>
      <p><strong>${escapeHtml(input.title)}</strong></p>
      <p>${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>
      ${href ? `<p><a href="${escapeHtml(href)}" style="display: inline-block; padding: 10px 15px; background-color: #3498db; color: white; text-decoration: none; border-radius: 4px;">Xem chi tiết</a></p>` : ""}
      <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
      <p style="font-size: 12px; color: #7f8c8d;">Hệ thống Quản lý Nghiên cứu Khoa học (DocManS)<br/>Học viện Quân y</p>
    </div>`;
}
