import { apiRequest } from "@/lib/api-client";

/** Tờ trình qua Phòng KHQS: chuyên viên → Trưởng ban QLKH → Trưởng phòng KHQS → Ban giám đốc. */
export type ApprovalSubmission = {
  id: string;
  kind: string;
  kindLabel: string;
  subjectType: "proposal" | "project";
  subjectId: string;
  subjectRef: string;
  title: string;
  link: string;
  stage: "BOARD_REVIEW" | "HEAD_REVIEW" | "LEADERSHIP" | "CLOSED";
  stageLabel: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";
  statusLabel: string;
  signer: string;
  signerLabel: string;
  submittedByName: string;
  lastNote: string;
  createdAt: string;
  updatedAt: string;
  steps: Array<{ stage: string; action: string; actorName: string; note: string; createdAt: string }>;
};

export type PendingSubmission = { id: string; kind: string; subjectId: string; subjectRef: string; stage: string; signer: string; stageLabel: string };

const requestJson = <T>(path: string, init?: RequestInit) => apiRequest<T>(path, init, "Không xử lý được tờ trình.");

export function loadApprovalInbox() {
  return requestJson<{ role: "board_head" | "head" | "leadership" | "staff"; submissions: ApprovalSubmission[] }>("/approval-submissions/inbox");
}

export function loadSubjectSubmissions(subjectType: "proposal" | "project", subjectId: string) {
  return requestJson<{ submissions: ApprovalSubmission[] }>(`/approval-submissions/subject?type=${subjectType}&id=${encodeURIComponent(subjectId)}`);
}

export function loadPendingSubmissions(subjectType: "proposal" | "project") {
  return requestJson<{ pending: PendingSubmission[] }>(`/approval-submissions/pending?subjectType=${subjectType}`);
}

export function advanceSubmission(id: string, note: string) {
  return requestJson<{ submission: ApprovalSubmission }>(`/approval-submissions/${id}/advance`, { method: "POST", body: JSON.stringify({ note }) });
}

export function returnSubmission(id: string, note: string) {
  return requestJson<{ submission: ApprovalSubmission }>(`/approval-submissions/${id}/return`, { method: "POST", body: JSON.stringify({ note }) });
}
