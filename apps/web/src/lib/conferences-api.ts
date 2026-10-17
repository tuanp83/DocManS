import { apiRequest } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/session";

export type ConferenceStatus = "draft" | "preparing" | "inviting" | "submission_closed" | "program_published" | "completed" | "cancelled";
export type ConferenceLevel = "academy" | "faculty" | "national" | "international";
export type ConferenceAction = "edit" | "officer.assign" | "invitation.manage" | "mailing.send" | "paper.review" | "export" | "close-submission" | "complete" | "cancel";
export type InvitationKind = "speaker" | "delegate";
export type InvitationStatus = "draft" | "sent" | "accepted" | "declined" | "revoked";
export type PaperKind = "abstract" | "full_paper";
export type MailingKind = "invitation" | "reminder" | "change_notice";

export type UnitOption = { id: string; code: string; name: string };

export type ConferenceInfo = {
  id: string; code: string; title: string; description: string | null; level: ConferenceLevel; status: ConferenceStatus; statusLabel: string;
  hostOrganizationUnit: UnitOption; location: string; startsAt: string; endsAt: string; responseDeadline: string | null;
  abstractDeadline: string; fullPaperDeadline: string; cancelReason: string | null;
};

export type ConferenceSummary = ConferenceInfo & {
  officer: { id: string; displayName: string } | null;
  createdBy: { id: string; displayName: string };
  version: string;
  counts: { invited: number; accepted: number; declined: number; awaitingAbstract: number; abstracts: number; fullPapers: number } | null;
  viewer: { actions: ConferenceAction[] };
};

export type PaperVersion = { id: string; kind: PaperKind; versionNumber: number; title: string; abstractText: string | null; submittedAt: string; file: { id: string; originalFileName: string; sizeBytes: number } | null };
export type PaperAuthor = { fullName: string; organization?: string; corresponding?: boolean };
export type Revision = { id: string; kind: PaperKind; reason: string; dueAt: string; requestedAt: string; resolvedAt?: string | null; requestedBy?: { displayName: string } };

export type ManagedInvitation = {
  id: string; kind: InvitationKind; fullName: string; academicTitle: string | null; email: string | null; isInternal: boolean;
  organizationUnit: { id: string; name: string } | null; externalOrganization: string | null; hasAccount: boolean; accountStatus: string | null;
  status: InvitationStatus; statusLabel: string; sentAt: string | null; respondedAt: string | null; declineReason: string | null; revokeReason: string | null; responseOverdue: boolean;
  paper: {
    id: string; title: string | null; authors: PaperAuthor[]; status: string; statusLabel: string; version: string; withdrawReason: string | null;
    latestAbstract: PaperVersion | null; latestFullPaper: PaperVersion | null; versions: PaperVersion[]; openRevisions: Revision[]; revisionHistory: Revision[];
  } | null;
};

export type ConferenceMailing = { id: string; kind: MailingKind; subject: string; message: string | null; sentAt: string; sentBy: { displayName: string }; recipientCount: number; sent: number; failed: number; skipped: number };
export type ConferenceEvent = { id: string; action: string; fromStatus: string | null; toStatus: string | null; reason: string | null; facts: Record<string, unknown> | null; actor: { displayName: string } | null; createdAt: string };

export type ManagedConference = ConferenceSummary & { invitations: ManagedInvitation[]; mailings: ConferenceMailing[]; events: ConferenceEvent[] };
export type ConferenceDetail = { mode: "management"; conference: ManagedConference; changeNoticeSuggested?: boolean } | { mode: "participant"; conference: ConferenceInfo };

export type MyPaper = {
  id: string; title: string | null; authors: PaperAuthor[]; status: string; withdrawReason: string | null; version: string; versions: PaperVersion[]; openRevisions: Revision[];
  viewer: { canSubmitAbstract: boolean; abstractBlockReason: string | null; canSubmitFullPaper: boolean; fullPaperBlockReason: string | null; canWithdraw: boolean } | null;
};
export type MyConference = {
  invitation: { id: string; kind: InvitationKind; status: InvitationStatus; sentAt: string | null; respondedAt: string | null; canRespond: boolean };
  conference: Omit<ConferenceInfo, "statusLabel"> & { statusLabel: string };
  paper: MyPaper | null;
};

export type PublicInvitation = {
  invitation: { fullName: string; academicTitle: string | null; kind: InvitationKind; isInternal: boolean };
  conference: { title: string; description: string | null; level: ConferenceLevel; hostOrganizationUnit: string; location: string; startsAt: string; endsAt: string; responseDeadline: string | null; abstractDeadline: string | null; fullPaperDeadline: string | null };
};

export const CONFERENCE_LEVEL_LABELS: Record<ConferenceLevel, string> = { academy: "Cấp Học viện", faculty: "Cấp khoa, viện", national: "Toàn quốc", international: "Quốc tế" };
export const CONFERENCE_STATUS_TONES: Record<ConferenceStatus, string> = { draft: "neutral", preparing: "info", inviting: "warning", submission_closed: "info", program_published: "info", completed: "success", cancelled: "danger" };
export const INVITATION_STATUS_TONES: Record<InvitationStatus, string> = { draft: "neutral", sent: "warning", accepted: "success", declined: "danger", revoked: "neutral" };
export const INVITATION_KIND_LABELS: Record<InvitationKind, string> = { speaker: "Báo cáo viên", delegate: "Đại biểu" };
export const PAPER_KIND_LABELS: Record<PaperKind, string> = { abstract: "Tóm tắt", full_paper: "Toàn văn" };
export const PAPER_STATUS_LABELS: Record<string, string> = { awaiting_abstract: "Chưa nộp tóm tắt", abstract_submitted: "Đã nộp tóm tắt", full_paper_submitted: "Đã nộp toàn văn", scheduled: "Đã xếp lịch", withdrawn: "Đã rút" };
export const MAILING_KIND_LABELS: Record<MailingKind, string> = { invitation: "Thư mời", reminder: "Thư nhắc", change_notice: "Thông báo thay đổi" };
export const CONFERENCE_EVENT_LABELS: Record<string, string> = {
  create: "Tạo hội nghị", update: "Sửa thông tin", "officer.assign": "Giao chuyên viên phụ trách", "officer.reassign": "Giao lại chuyên viên phụ trách", "officer.revoke": "Thu hồi chuyên viên phụ trách",
  "open-invitations": "Bắt đầu mời và nhận bài", "close-submission": "Đóng nhận bài", complete: "Kết thúc hội nghị", cancel: "Huỷ hội nghị",
  "invitation.add": "Thêm khách mời", "invitation.update": "Sửa khách mời", "invitation.revoke": "Huỷ lời mời", "invitation.accept": "Nhận lời", "invitation.decline": "Từ chối",
  "mailing.invitation": "Gửi thư mời", "mailing.reminder": "Gửi thư nhắc", "mailing.change_notice": "Gửi thông báo thay đổi",
  "paper.create": "Tạo báo cáo", "paper.submit-abstract": "Nộp tóm tắt", "paper.submit-full": "Nộp toàn văn", "paper.request-revision": "Yêu cầu sửa", "paper.withdraw": "Rút báo cáo", "paper.cancel": "Huỷ báo cáo"
};

const json = <T>(path: string, init?: RequestInit) => apiRequest<T>(path, init, "Không thể xử lý yêu cầu.");
const post = <T>(path: string, body: unknown) => json<T>(path, { method: "POST", body: JSON.stringify(body) });
const conferencePath = (id: string) => `/conferences/${encodeURIComponent(id)}`;
const paperPath = (id: string) => `/conference-papers/${encodeURIComponent(id)}`;

export async function listConferences() { return (await json<{ conferences: ConferenceSummary[] }>("/conferences")).conferences; }
export async function getConference(id: string) { return json<ConferenceDetail>(conferencePath(id)); }
export async function createConference(input: Record<string, unknown>) { return post<ConferenceDetail>("/conferences", input); }
export async function updateConference(id: string, input: Record<string, unknown>) { return json<ConferenceDetail>(conferencePath(id), { method: "PATCH", body: JSON.stringify(input) }); }
export async function listHostUnits() { return (await json<{ organizationUnits: UnitOption[] }>("/conferences/host-units")).organizationUnits; }
export async function listOfficerCandidates() { return (await json<{ users: Array<{ id: string; displayName: string; username: string; unit: string }> }>("/conferences/officer-candidates")).users; }
export async function assignConferenceOfficer(id: string, input: { version: string; userId: string; reason?: string }) { return post<ConferenceDetail>(`${conferencePath(id)}/officer`, input); }
export async function revokeConferenceOfficer(id: string, input: { version: string; reason: string }) { return post<ConferenceDetail>(`${conferencePath(id)}/officer/revoke`, input); }
export async function transitionConference(id: string, action: "close-submission" | "complete" | "cancel", input: { version: string; reason?: string }) { return post<ConferenceDetail>(`${conferencePath(id)}/${action}`, input); }
export function conferenceExportUrl(id: string) { return `${getApiBaseUrl()}${conferencePath(id)}/export.xlsx`; }
export function invitationTemplateUrl() { return `${getApiBaseUrl()}/conferences/invitation-template.xlsx`; }

export async function searchInvitableUsers(id: string, q: string) { return (await json<{ users: Array<{ id: string; displayName: string; username: string | null; unit: string; credentialEmail: string | null; systemRole: string }> }>(`${conferencePath(id)}/user-candidates?q=${encodeURIComponent(q)}`)).users; }
export async function listInviteeUnits(id: string) { return (await json<{ organizationUnits: UnitOption[] }>(`${conferencePath(id)}/organization-units`)).organizationUnits; }
export async function addInvitations(id: string, invitations: Record<string, unknown>[]) { return post<{ created: Array<{ id: string; fullName: string }> }>(`${conferencePath(id)}/invitations`, { invitations }); }
export async function importInvitations(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ created: Array<{ id: string; fullName: string }>; errors: Array<{ row: number; message: string }> }>(`${conferencePath(id)}/invitations/import`, { method: "POST", body: form }, "Không nhập được tệp Excel.");
}
export async function updateInvitation(id: string, invitationId: string, input: Record<string, unknown>) { return json(`${conferencePath(id)}/invitations/${encodeURIComponent(invitationId)}`, { method: "PATCH", body: JSON.stringify(input) }); }
export async function revokeInvitation(id: string, invitationId: string, reason: string) { return post(`${conferencePath(id)}/invitations/${encodeURIComponent(invitationId)}/revoke`, { reason }); }
export async function sendMailing(id: string, input: { kind: MailingKind; invitationIds: string[]; subject?: string; message?: string }) {
  return post<{ mailingId: string; recipients: number; sent: number; failed: number; skipped: number; ignored: number }>(`${conferencePath(id)}/mailings`, input);
}

export async function listMyConferences() { return (await json<{ items: MyConference[] }>("/my-conferences")).items; }
export async function respondToInvitation(invitationId: string, input: { decision: "accept" | "decline"; reason?: string }) { return post(`/my-conferences/invitations/${encodeURIComponent(invitationId)}/respond`, input); }

export async function submitPaper(paperId: string, input: { version: string; kind: PaperKind; title?: string; abstractText?: string; authors?: PaperAuthor[] }, file?: File | null) {
  const form = new FormData();
  form.append("version", input.version);
  form.append("kind", input.kind);
  if (input.title) form.append("title", input.title);
  if (input.abstractText) form.append("abstractText", input.abstractText);
  if (input.authors) form.append("authors", JSON.stringify(input.authors));
  if (file) form.append("file", file);
  return apiRequest<{ versionId: string; versionNumber: number; status: string }>(`${paperPath(paperId)}/submissions`, { method: "POST", body: form }, "Không nộp được bài.");
}
export async function withdrawPaper(paperId: string, input: { version: string; reason?: string }) { return post(`${paperPath(paperId)}/withdraw`, input); }
export async function requestPaperRevision(paperId: string, input: { version: string; kind: PaperKind; reason: string; dueAt: string }) { return post(`${paperPath(paperId)}/revision-requests`, input); }
export function paperDownloadUrl(paperId: string, versionId: string) { return `${getApiBaseUrl()}${paperPath(paperId)}/versions/${encodeURIComponent(versionId)}/download`; }

export async function lookupPublicInvitation(token: string) { return post<PublicInvitation>("/public/conference-invitations/lookup", { token }); }
export async function respondPublicInvitation(token: string, decision: "accept" | "decline", reason?: string) {
  return post<{ status: string; account: "existing" | "created" | "pending_activation" | null; activationPath: string | null }>("/public/conference-invitations/respond", { token, decision, reason });
}
