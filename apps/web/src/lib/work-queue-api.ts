import { getApiBaseUrl } from "@/lib/session";

export type WorkItemKind =
  | "report_due" | "report_supplement" | "request_supplement" | "milestone_progress" | "report_review" | "adjustment_review"
  | "extension_validation" | "extension_decision" | "setup_configure" | "setup_confirm" | "officer_assign" | "health_assess" | "proposal_review";

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

export type WorkQueue = { items: WorkItem[]; summary: { total: number; overdue: number; dueWithin7Days: number }; asOf: string };

export const WORK_ITEM_GROUPS: Record<WorkItemKind, string> = {
  report_due: "Báo cáo", report_supplement: "Báo cáo", request_supplement: "Đề nghị", milestone_progress: "Tiến độ",
  report_review: "Xét duyệt", adjustment_review: "Xét duyệt", extension_validation: "Xét duyệt", extension_decision: "Quyết định",
  setup_configure: "Thiết lập", setup_confirm: "Thiết lập", officer_assign: "Phân công", health_assess: "Đánh giá", proposal_review: "Phản biện"
};

export async function loadWorkQueue(): Promise<WorkQueue> {
  const response = await fetch(`${getApiBaseUrl()}/work-queue`, { credentials: "include", headers: { "Content-Type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Không tải được danh sách việc.");
  return body as WorkQueue;
}
