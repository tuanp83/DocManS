import { calendarDayIndex, localDayIndex } from "../approved-projects/project-progress.js";
import { label, NOTIFICATION_TYPES, projectLink, proposalLink, vnDate, type WorkflowEvent } from "./workflow-events.js";

/**
 * Nhắc hạn (docs/design/nghiem-thu-thanh-ly-dong-de-tai.md, mục Thông báo). Hàm thuần: nhận dữ liệu đã tải
 * và "hôm nay" theo giờ Việt Nam, trả về các sự kiện cần gửi. Mỗi sự kiện mang `dedupKey` theo từng
 * nấc thời gian, nên chạy lại nhiều lần trong ngày (hoặc bỏ lỡ một ngày) vẫn không gửi trùng.
 *
 * Nấc trước hạn: còn ≤ 7 ngày, ≤ 3 ngày, ≤ 1 ngày (gồm cả ngày đến hạn). Quá hạn: nhắc mỗi tuần một lần,
 * gửi cả chủ nhiệm và chuyên viên phụ trách.
 */

export type ReminderProject = {
  id: string;
  code?: string | null;
  title: string;
  status: string;
  endDate: Date | null;
  piUserId: string | null;
  officerUserId: string | null;
  checkpoints: Array<{ id: string; title: string; dueDate: Date; status: string }>;
  reports: Array<{ id: string; checkpointId: string | null; status: string; revision: number; responseDeadline: Date | null }>;
  requests: Array<{ id: string; requestType: string; status: string; responseDeadline: Date | null }>;
};

export type ReminderSupplementRequest = {
  id: string;
  proposalId: string;
  dueDate: Date;
  proposal: { code?: string | null; title: string; ownerId: string; status: string };
};

const SATISFIED_REPORT_STATUSES = ["submitted", "under_review", "accepted"];
const ACTIVE_PROJECT_STATUSES = ["executing", "paused"];

/** Nấc nhắc trước hạn; null nếu chưa tới lúc nhắc hoặc đã quá hạn. */
export function upcomingBucket(daysLeft: number): "d7" | "d3" | "d1" | null {
  if (daysLeft < 0) return null;
  if (daysLeft <= 1) return "d1";
  if (daysLeft <= 3) return "d3";
  if (daysLeft <= 7) return "d7";
  return null;
}

function whenText(daysLeft: number) {
  if (daysLeft === 0) return "hôm nay";
  if (daysLeft === 1) return "ngày mai";
  return `còn ${daysLeft} ngày`;
}

export function collectProjectReminders(project: ReminderProject, now: Date): WorkflowEvent[] {
  if (!ACTIVE_PROJECT_STATUSES.includes(project.status)) return [];
  const today = localDayIndex(now);
  const events: WorkflowEvent[] = [];
  const name = label(project);
  const link = projectLink(project.id);

  // 1. Kỳ báo cáo đang mở chưa có báo cáo đã nộp.
  for (const checkpoint of project.checkpoints) {
    if (checkpoint.status !== "open") continue;
    const satisfied = project.reports.some((report) => report.checkpointId === checkpoint.id && SATISFIED_REPORT_STATUSES.includes(report.status));
    if (satisfied) continue;
    const daysLeft = calendarDayIndex(checkpoint.dueDate) - today;
    const bucket = upcomingBucket(daysLeft);
    if (bucket) {
      events.push({
        type: NOTIFICATION_TYPES.reportDue,
        userIds: [project.piUserId],
        title: `Sắp đến hạn báo cáo: ${checkpoint.title}`,
        message: `Kỳ báo cáo "${checkpoint.title}" của đề tài ${name} đến hạn ${vnDate(checkpoint.dueDate)} (${whenText(daysLeft)}). Vui lòng nộp báo cáo tiến độ đúng hạn.`,
        link,
        dedupKey: `report-due:${checkpoint.id}:${bucket}`,
        metadata: { projectId: project.id, checkpointId: checkpoint.id, dueDate: checkpoint.dueDate.toISOString(), bucket }
      });
    } else if (daysLeft < 0) {
      const week = Math.floor(-daysLeft / 7);
      events.push({
        type: NOTIFICATION_TYPES.reportOverdue,
        userIds: [project.piUserId, project.officerUserId],
        title: `Quá hạn báo cáo: ${checkpoint.title}`,
        message: `Kỳ báo cáo "${checkpoint.title}" của đề tài ${name} đã quá hạn ${-daysLeft} ngày (hạn ${vnDate(checkpoint.dueDate)}) mà chưa có báo cáo được nộp.`,
        link,
        dedupKey: `report-overdue:${checkpoint.id}:w${week}`,
        metadata: { projectId: project.id, checkpointId: checkpoint.id, dueDate: checkpoint.dueDate.toISOString(), daysOverdue: -daysLeft }
      });
    }
  }

  // 2. Hạn bổ sung báo cáo / yêu cầu điều chỉnh, gia hạn.
  const supplements = [
    ...project.reports.filter((report) => report.status === "supplement_requested" && report.responseDeadline).map((report) => ({ key: `report-supplement-due:${report.id}`, what: `báo cáo phiên bản ${report.revision}`, deadline: report.responseDeadline as Date, id: report.id })),
    ...project.requests.filter((request) => request.status === "supplement_requested" && request.responseDeadline).map((request) => ({ key: `request-supplement-due:${request.id}`, what: request.requestType === "extension" ? "yêu cầu gia hạn" : "yêu cầu điều chỉnh", deadline: request.responseDeadline as Date, id: request.id }))
  ];
  for (const item of supplements) {
    const daysLeft = calendarDayIndex(item.deadline) - today;
    const bucket = upcomingBucket(daysLeft);
    if (!bucket) continue;
    events.push({
      type: NOTIFICATION_TYPES.supplementDue,
      userIds: [project.piUserId],
      title: `Sắp đến hạn bổ sung ${item.what}`,
      message: `Hạn bổ sung ${item.what} của đề tài ${name} là ${vnDate(item.deadline)} (${whenText(daysLeft)}).`,
      link,
      dedupKey: `${item.key}:${bucket}`,
      metadata: { projectId: project.id, recordId: item.id, deadline: item.deadline.toISOString(), bucket }
    });
  }

  // 3. Sắp hết thời gian thực hiện: nhắc chuẩn bị hồ sơ nghiệm thu (khoá theo ngày kết thúc, gia hạn thì nhắc lại).
  if (project.status === "executing" && project.endDate) {
    const daysLeft = calendarDayIndex(project.endDate) - today;
    const bucket = daysLeft >= 0 && daysLeft <= 30 ? (daysLeft <= 7 ? "d7" : "d30") : null;
    if (bucket) {
      const endKey = project.endDate.toISOString().slice(0, 10);
      events.push({
        type: NOTIFICATION_TYPES.reportDue,
        userIds: [project.piUserId, project.officerUserId],
        title: `Đề tài sắp hết thời gian thực hiện`,
        message: `Đề tài ${name} kết thúc ngày ${vnDate(project.endDate)} (${whenText(daysLeft)}). Chủ nhiệm cần hoàn thiện báo cáo tổng kết và nộp hồ sơ nghiệm thu.`,
        link,
        dedupKey: `project-end:${project.id}:${endKey}:${bucket}`,
        metadata: { projectId: project.id, endDate: project.endDate.toISOString(), bucket }
      });
    }
  }
  return events;
}

export function collectProposalSupplementReminders(request: ReminderSupplementRequest, now: Date): WorkflowEvent[] {
  if (request.proposal.status !== "supplement_requested") return [];
  const daysLeft = localDayIndex(request.dueDate) - localDayIndex(now);
  const bucket = upcomingBucket(daysLeft);
  if (!bucket) return [];
  return [{
    type: NOTIFICATION_TYPES.supplementDue,
    userIds: [request.proposal.ownerId],
    title: "Sắp đến hạn bổ sung hồ sơ đề xuất",
    message: `Hồ sơ ${label(request.proposal)} cần được bổ sung và nộp lại trước ${vnDate(request.dueDate)} (${whenText(daysLeft)}).`,
    link: proposalLink(request.proposalId),
    dedupKey: `proposal-supplement-due:${request.id}:${bucket}`,
    metadata: { proposalId: request.proposalId, supplementRequestId: request.id, dueDate: request.dueDate.toISOString(), bucket }
  }];
}
