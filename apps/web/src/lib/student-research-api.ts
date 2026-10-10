import { getApiBaseUrl } from "@/lib/session";

export type StudentProjectStatus = "DRAFT" | "SUBMITTED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type StudentProjectAction = "edit" | "submit" | "approve" | "return" | "cancel" | "complete" | "document.upload";

export type StudentDocument = {
  id: string; documentType: string; uploadedAt: string; uploadedById: string; uploadedBy?: { displayName: string } | null;
  file: { id: string; originalFileName: string; mimeType: string; sizeBytes: number } | null; legacy: boolean; canDelete: boolean;
};

export type StudentEvent = { id: string; action: string; fromStatus: string | null; toStatus: string | null; reason: string | null; actor: { displayName: string } | null; createdAt: string };

export type StudentProject = {
  id: string; code: string | null; name: string; studentName: string; studentClass: string; studentContact: string | null;
  status: StudentProjectStatus; score: number | null; award: string | null;
  startDate: string | null; endDate: string | null; createdAt: string; updatedAt: string; version: string;
  supervisorId: string; organizationUnitId: string | null;
  supervisor: { id: string; displayName: string; username?: string } | null;
  officer: { id: string; displayName: string } | null;
  organizationUnit: { id: string; code: string; name: string } | null;
  documents?: StudentDocument[];
  events?: StudentEvent[];
  viewer: { canManage: boolean; canAttach: boolean; actions: StudentProjectAction[] };
};

export type OrganizationUnitOption = { id: string; code: string; name: string };

export const STUDENT_STATUS_LABELS: Record<StudentProjectStatus, string> = { DRAFT: "Nháp", SUBMITTED: "Chờ duyệt", ACTIVE: "Đang thực hiện", COMPLETED: "Đã hoàn thành", CANCELLED: "Đã huỷ" };
export const STUDENT_STATUS_TONES: Record<StudentProjectStatus, string> = { DRAFT: "neutral", SUBMITTED: "warning", ACTIVE: "info", COMPLETED: "success", CANCELLED: "danger" };
export const STUDENT_DOCUMENT_LABELS: Record<string, string> = { REGISTRATION: "Phiếu đăng ký", PROPOSAL: "Thuyết minh", PROGRESS_REPORT: "Báo cáo tiến độ", FINAL_REPORT: "Báo cáo tổng kết", EVALUATION: "Phiếu đánh giá", OTHER: "Khác" };
export const STUDENT_EVENT_LABELS: Record<string, string> = {
  create: "Tạo đề tài", register: "Đăng ký đề tài", update: "Sửa thông tin", submit: "Nộp đề tài", approve: "Duyệt đề tài", return: "Trả lại để chỉnh sửa",
  cancel: "Huỷ đề tài", complete: "Ghi nhận hoàn thành", "document.upload": "Tải tài liệu lên", "document.delete": "Xoá tài liệu"
};

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Không thể xử lý yêu cầu.");
  return body as T;
}

const projectPath = (id: string) => `/student-research/${encodeURIComponent(id)}`;

export async function listStudentProjects() { return (await json<{ projects: StudentProject[] }>("/student-research")).projects; }
export async function getStudentProject(id: string) { return (await json<{ project: StudentProject }>(projectPath(id))).project; }
export async function listSupervisorCandidates() { return (await json<{ users: Array<{ id: string; displayName: string; username: string; unit: string }> }>("/student-research/supervisor-candidates")).users; }
export async function listStudentResearchUnits() { return (await json<{ organizationUnits: OrganizationUnitOption[] }>("/student-research/organization-units")).organizationUnits; }
export async function createStudentProject(input: Record<string, unknown>) { return (await json<{ project: StudentProject }>("/student-research", { method: "POST", body: JSON.stringify(input) })).project; }
export async function registerStudentProject(input: Record<string, unknown>) { return (await json<{ project: StudentProject }>("/student-research/registrations", { method: "POST", body: JSON.stringify(input) })).project; }
export async function updateStudentProject(id: string, input: Record<string, unknown>) { return (await json<{ project: StudentProject }>(projectPath(id), { method: "PATCH", body: JSON.stringify(input) })).project; }
export async function transitionStudentProject(id: string, action: "submit" | "approve" | "return" | "cancel", input: { version: string; reason?: string; code?: string }) {
  // Sau khi trả lại, người trả lại không còn xem được bản nháp: máy chủ trả { id, status, visible: false }.
  return (await json<{ project: StudentProject | { id: string; status: StudentProjectStatus; visible: false } }>(`${projectPath(id)}/${action}`, { method: "POST", body: JSON.stringify(input) })).project;
}
export async function completeStudentProject(id: string, input: { score?: number; award?: string; version: string }) { return (await json<{ project: StudentProject }>(`${projectPath(id)}/complete`, { method: "PATCH", body: JSON.stringify(input) })).project; }

export async function uploadStudentDocument(id: string, documentType: string, file: File) {
  const form = new FormData();
  form.append("documentType", documentType);
  form.append("file", file);
  const response = await fetch(`${getApiBaseUrl()}${projectPath(id)}/documents`, { method: "POST", credentials: "include", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 413 ? "Tệp vượt quá dung lượng cho phép." : typeof body.message === "string" ? body.message : "Không tải được tệp lên.");
  return body;
}
export async function deleteStudentDocument(id: string, documentId: string) { return json(`${projectPath(id)}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" }); }
export function studentDocumentDownloadUrl(id: string, documentId: string) { return `${getApiBaseUrl()}${projectPath(id)}/documents/${encodeURIComponent(documentId)}/download`; }
