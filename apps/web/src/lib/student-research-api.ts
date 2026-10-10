import { getApiBaseUrl } from "@/lib/session";

export type StudentProject = {
  id: string; code: string; name: string; studentName: string; studentClass: string; studentContact: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED"; score: number | null; award: string | null;
  startDate: string | null; endDate: string | null; createdAt: string;
  supervisor: { id: string; displayName: string; username?: string } | null;
  officer: { id: string; displayName: string } | null;
  organizationUnit: { id: string; code: string; name: string } | null;
  documents?: Array<{ id: string; documentType: string; uploadedAt: string; uploadedBy?: { displayName: string } | null; file?: { id: string; originalFileName: string; sizeBytes: number } | null }>;
  viewer: { canManage: boolean; canAttach: boolean };
};

export const STUDENT_STATUS_LABELS: Record<StudentProject["status"], string> = { DRAFT: "Nháp", ACTIVE: "Đang thực hiện", COMPLETED: "Đã hoàn thành", CANCELLED: "Đã huỷ" };
export const STUDENT_DOCUMENT_LABELS: Record<string, string> = { REGISTRATION: "Phiếu đăng ký", PROPOSAL: "Thuyết minh", PROGRESS_REPORT: "Báo cáo tiến độ", FINAL_REPORT: "Báo cáo tổng kết", EVALUATION: "Phiếu đánh giá", OTHER: "Khác" };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Không thể xử lý yêu cầu.");
  return body as T;
}

export async function listStudentProjects() { return (await json<{ projects: StudentProject[] }>("/student-research")).projects; }
export async function getStudentProject(id: string) { return (await json<{ project: StudentProject }>(`/student-research/${encodeURIComponent(id)}`)).project; }
export async function listSupervisorCandidates() { return (await json<{ users: Array<{ id: string; displayName: string; username: string; unit: string }> }>("/student-research/supervisor-candidates")).users; }
export async function createStudentProject(input: Record<string, unknown>) { return (await json<{ project: StudentProject }>("/student-research", { method: "POST", body: JSON.stringify(input) })).project; }
export async function attachStudentDocument(id: string, input: { documentType: string; fileId: string }) { return json(`/student-research/${encodeURIComponent(id)}/documents`, { method: "POST", body: JSON.stringify(input) }); }
export async function completeStudentProject(id: string, input: { score?: number; award?: string }) { return (await json<{ project: StudentProject }>(`/student-research/${encodeURIComponent(id)}/complete`, { method: "PATCH", body: JSON.stringify(input) })).project; }
