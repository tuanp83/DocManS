import { calendarDayIndex, localDayIndex } from "./project-progress.js";

/**
 * "Việc của tôi" (docs/design/quan-ly-tien-do-nhiem-vu.md, mục 6): dựng danh sách việc đang chờ người dùng từ
 * dữ liệu đề tài ĐÃ được lọc theo quyền (ApprovedProjectsService.listProjects) và phiếu phản biện của chính họ.
 * Hàm thuần để test trực tiếp; không tự cấp thêm quyền — mọi việc đều dựa trên allowedActions của đề tài.
 */

export type WorkItemKind =
  | "report_due"
  | "report_supplement"
  | "request_supplement"
  | "milestone_progress"
  | "report_review"
  | "adjustment_review"
  | "extension_validation"
  | "extension_decision"
  | "setup_configure"
  | "setup_confirm"
  | "officer_assign"
  | "health_assess"
  | "proposal_review";

export type WorkItem = {
  id: string;
  kind: WorkItemKind;
  title: string;
  context: { type: "project" | "proposal"; id: string; title: string };
  href: string;
  dueDate: string | null;
  overdue: boolean;
  daysLeft: number | null;
};

type AnyRecord = Record<string, any>;

/** Việc có hạn trong khoảng này (ngày) mới hiện, để danh sách không bị ngập bởi mốc còn xa. */
export const WORK_QUEUE_HORIZON_DAYS = 30;

function timing(due: unknown, today: Date) {
  if (!due) return { dueDate: null, overdue: false, daysLeft: null };
  const date = due instanceof Date ? due : new Date(String(due).length === 10 ? `${due}T00:00:00.000Z` : String(due));
  if (Number.isNaN(date.valueOf())) return { dueDate: null, overdue: false, daysLeft: null };
  // Hạn là ngày lịch; "hôm nay" theo giờ Việt Nam.
  const daysLeft = calendarDayIndex(date) - localDayIndex(today);
  return { dueDate: date.toISOString(), overdue: daysLeft < 0, daysLeft };
}

function withinHorizon(due: unknown, today: Date) {
  const { daysLeft } = timing(due, today);
  return daysLeft !== null && daysLeft <= WORK_QUEUE_HORIZON_DAYS;
}

const REQUEST_LABELS: Record<string, string> = { adjustment: "điều chỉnh", extension: "gia hạn" };

export function projectWorkItems(project: AnyRecord, actor: { id: string; systemRole?: string | null }, today = new Date()): WorkItem[] {
  const allowed: string[] = project.viewerAuthorization?.allowedActions ?? [];
  const can = (action: string) => allowed.includes(action);
  const context = { type: "project" as const, id: project.id, title: project.title };
  const href = `/projects/${project.id}`;
  const items: WorkItem[] = [];
  const push = (key: string, kind: WorkItemKind, title: string, due: unknown) => items.push({ id: `${project.id}:${key}`, kind, title, context, href, ...timing(due, today) });
  const me = (project.members ?? []).find((member: AnyRecord) => member.userId === actor.id && member.status === "ACTIVE");
  const isPi = me?.participationRole === "TOPIC_PI";
  const executing = project.status === "executing";

  // Chủ nhiệm: kỳ báo cáo đến hạn chưa có báo cáo đang xử lý/đã chấp nhận; báo cáo và đề nghị bị yêu cầu bổ sung.
  if (isPi && can("project.report.draft")) {
    for (const checkpoint of project.checkpoints ?? []) {
      if (checkpoint.status === "completed" || !withinHorizon(checkpoint.dueDate, today)) continue;
      const handled = (project.reports ?? []).some((report: AnyRecord) => report.checkpointId === checkpoint.id && ["submitted", "under_review", "accepted"].includes(report.status));
      if (!handled) push(`report-due:${checkpoint.id}`, "report_due", `Nộp báo cáo: ${checkpoint.title}`, checkpoint.dueDate);
    }
    for (const report of project.reports ?? []) {
      // Bản bị yêu cầu bổ sung giữ nguyên trạng thái sau khi PI tạo bản sửa; chỉ nhắc khi chưa có bản mới hơn.
      const superseded = (project.reports ?? []).some((other: AnyRecord) => other.revision > report.revision && (other.checkpointId ?? null) === (report.checkpointId ?? null));
      if (report.status === "supplement_requested" && !superseded) push(`report-supplement:${report.id}`, "report_supplement", `Bổ sung báo cáo phiên bản ${report.revision}`, report.responseDeadline);
    }
  }
  if (isPi) {
    for (const request of project.requests ?? []) {
      if (request.status === "supplement_requested") push(`request-supplement:${request.id}`, "request_supplement", `Bổ sung đề nghị ${REQUEST_LABELS[request.requestType] ?? request.requestType}`, request.responseDeadline);
    }
  }

  // Cập nhật tiến độ: chủ nhiệm mọi mốc, thành viên mốc mình phụ trách; chỉ mốc sắp đến hạn hoặc quá hạn.
  if (executing && me && can("project.progress.update")) {
    for (const milestone of project.milestones ?? []) {
      if (milestone.status === "completed" || !withinHorizon(milestone.dueDate, today)) continue;
      if (isPi || milestone.responsibleMemberId === me.id) push(`milestone:${milestone.id}`, "milestone_progress", `Cập nhật tiến độ mốc: ${milestone.title}`, milestone.dueDate);
    }
  }

  // Chuyên viên phụ trách: báo cáo, đề nghị chờ xử lý; thiết lập; đánh giá sức khoẻ khi đề tài Vàng/Đỏ chưa có đánh giá còn hiệu lực.
  if (can("project.report.review")) {
    for (const report of project.reports ?? []) {
      if (["submitted", "under_review"].includes(report.status)) push(`report-review:${report.id}`, "report_review", `Xét báo cáo phiên bản ${report.revision}`, null);
    }
  }
  for (const request of project.requests ?? []) {
    if (request.requestType === "adjustment" && ["submitted", "under_staff_review"].includes(request.status) && can("project.adjustment.review")) push(`adjustment:${request.id}`, "adjustment_review", "Xét đề nghị điều chỉnh", null);
    if (request.requestType === "extension" && ["submitted", "under_staff_validation"].includes(request.status) && can("project.extension.validate")) push(`extension:${request.id}`, "extension_validation", "Thẩm định đề nghị gia hạn", null);
    if (request.requestType === "extension" && request.status === "ready_for_head_decision" && can("project.extension.approve")) push(`extension-decision:${request.id}`, "extension_decision", "Quyết định đề nghị gia hạn", null);
  }
  if (project.status === "preparing" && can("project.setup.configure")) {
    if (!(project.milestones ?? []).length) push("setup", "setup_configure", "Thiết lập mốc thực hiện", project.startDate);
    else push("setup-confirm", "setup_confirm", "Xác nhận bắt đầu thực hiện", project.startDate);
  }
  const summary = project.progressSummary;
  if (can("project.health.assess") && summary && ["amber", "red"].includes(summary.computedLevel) && summary.levelSource !== "assessment") {
    push("health", "health_assess", summary.needsReassessment ? "Đánh giá lại sức khoẻ đề tài" : `Đánh giá sức khoẻ đề tài (${summary.computedLevel === "red" ? "Đỏ" : "Vàng"})`, null);
  }

  // Phân công chuyên viên: chỉ Trưởng phòng QLKH và lãnh đạo nhận việc này, để chuyên viên không bị ngập việc.
  if (!project.officer && project.status === "preparing" && can("project.officer.assign") && ["RESEARCH_MANAGEMENT_HEAD", "LEADERSHIP_APPROVAL_AUTHORITY"].includes(actor.systemRole ?? "")) {
    push("officer", "officer_assign", "Phân công chuyên viên phụ trách", null);
  }
  return items;
}

export function reviewWorkItems(assignments: AnyRecord[], today = new Date()): WorkItem[] {
  return assignments
    .filter((assignment) => assignment.status === "assigned" && !assignment.revokedAt && !assignment.completedAt && assignment.review?.status !== "submitted")
    .map((assignment) => ({
      id: `review:${assignment.id}`,
      kind: "proposal_review" as const,
      title: "Chấm phiếu phản biện",
      context: { type: "proposal" as const, id: assignment.proposal?.id ?? assignment.proposalId, title: assignment.proposal?.title ?? "Hồ sơ đề xuất" },
      href: "/my-reviews",
      ...timing(assignment.dueDate, today)
    }));
}

/** Quá hạn trước, rồi theo hạn gần nhất; việc không có hạn xếp cuối. */
export function sortWorkItems(items: WorkItem[]) {
  return [...items].sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    if (left.daysLeft === null && right.daysLeft === null) return left.title.localeCompare(right.title, "vi");
    if (left.daysLeft === null) return 1;
    if (right.daysLeft === null) return -1;
    return left.daysLeft - right.daysLeft;
  });
}

export function summarizeWorkItems(items: WorkItem[]) {
  return { total: items.length, overdue: items.filter((item) => item.overdue).length, dueWithin7Days: items.filter((item) => !item.overdue && item.daysLeft !== null && item.daysLeft <= 7).length };
}
