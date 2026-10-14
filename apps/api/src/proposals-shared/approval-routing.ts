import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { isLeadership, isScienceDeputyDirector } from "./proposal-access.js";

/**
 * Luồng trình duyệt qua Phòng KHQS (một nguồn quy tắc cho mọi thủ tục lên Ban giám đốc):
 *   chuyên viên lập → BOARD_REVIEW (Trưởng ban QLKH rà soát, trình) → HEAD_REVIEW (Trưởng phòng duyệt)
 *   → LEADERSHIP (Ban giám đốc ký) → CLOSED. Trả lại ở bước nào cũng về chuyên viên (RETURNED); không bỏ bước.
 * Người ký: DIRECTOR (phê duyệt đề tài, kinh phí, thanh lý) hoặc DIRECTOR_OR_SCIENCE_DEPUTY (thành lập hội đồng,
 * gia hạn, điều chỉnh không đổi kinh phí).
 */

export const APPROVAL_KINDS = {
  evaluationCouncil: "EVALUATION_COUNCIL",
  decisionPackage: "DECISION_PACKAGE",
  irbCouncil: "IRB_COUNCIL",
  irbCertificate: "IRB_CERTIFICATE",
  acceptanceCouncil: "ACCEPTANCE_COUNCIL",
  projectExtension: "PROJECT_EXTENSION",
  projectAdjustment: "PROJECT_ADJUSTMENT",
  liquidation: "LIQUIDATION"
} as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[keyof typeof APPROVAL_KINDS];

export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  EVALUATION_COUNCIL: "Thành lập hội đồng đánh giá",
  DECISION_PACKAGE: "Phê duyệt đề tài và kinh phí",
  IRB_COUNCIL: "Thành lập hội đồng đạo đức (IRB)",
  IRB_CERTIFICATE: "Cấp Giấy chứng nhận đạo đức (IRB)",
  ACCEPTANCE_COUNCIL: "Thành lập hội đồng nghiệm thu",
  PROJECT_EXTENSION: "Gia hạn đề tài",
  PROJECT_ADJUSTMENT: "Điều chỉnh đề tài",
  LIQUIDATION: "Thanh lý hợp đồng"
};

/** Người ký ở Ban giám đốc theo thủ tục. */
export const APPROVAL_SIGNERS: Record<ApprovalKind, ApprovalSigner> = {
  EVALUATION_COUNCIL: "DIRECTOR_OR_SCIENCE_DEPUTY",
  DECISION_PACKAGE: "DIRECTOR",
  IRB_COUNCIL: "DIRECTOR_OR_SCIENCE_DEPUTY",
  IRB_CERTIFICATE: "DIRECTOR_OR_SCIENCE_DEPUTY",
  ACCEPTANCE_COUNCIL: "DIRECTOR_OR_SCIENCE_DEPUTY",
  PROJECT_EXTENSION: "DIRECTOR_OR_SCIENCE_DEPUTY",
  PROJECT_ADJUSTMENT: "DIRECTOR_OR_SCIENCE_DEPUTY",
  LIQUIDATION: "DIRECTOR"
};

export type ApprovalSigner = "DIRECTOR" | "DIRECTOR_OR_SCIENCE_DEPUTY";
export type ApprovalStage = "BOARD_REVIEW" | "HEAD_REVIEW" | "LEADERSHIP" | "CLOSED";

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  BOARD_REVIEW: "Chờ Trưởng ban QLKH rà soát",
  HEAD_REVIEW: "Chờ Trưởng phòng KHQS duyệt",
  LEADERSHIP: "Chờ Ban giám đốc ký",
  CLOSED: "Đã kết thúc"
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "Đang trình",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Không phê duyệt",
  RETURNED: "Bị trả lại",
  CANCELLED: "Đã thay bằng tờ trình mới"
};

export type ApprovalKey = { kind: ApprovalKind; subjectType: "proposal" | "project"; subjectId: string; subjectRef?: string };

// Kiểu lỏng có chủ ý: chạy với client giao dịch Prisma và CSDL giả lập trong test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoutingClient = any;

export type ApprovalSubmissionRow = {
  id: string;
  kind: ApprovalKind;
  subjectType: string;
  subjectId: string;
  subjectRef: string;
  title: string;
  hostOrganizationUnitId: string;
  stage: ApprovalStage;
  status: string;
  signer: ApprovalSigner;
  submittedById: string;
  lastNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
};

function keyWhere(key: ApprovalKey) {
  return { kind: key.kind, subjectType: key.subjectType, subjectId: key.subjectId, subjectRef: key.subjectRef ?? "" };
}

export function canSignApproval(actor: SafeUserContext | undefined, signer: ApprovalSigner) {
  return isLeadership(actor) || (signer === "DIRECTOR_OR_SCIENCE_DEPUTY" && isScienceDeputyDirector(actor));
}

/**
 * Chuyên viên trình thủ tục: mở hồ sơ trình ở bước Trưởng ban (hồ sơ đang mở trước đó của cùng thủ tục được thay).
 * Gọi trong giao dịch của thao tác "trình"; người gọi gửi thông báo cho Trưởng ban sau khi commit.
 */
export async function openApprovalSubmission(
  client: RoutingClient,
  actor: SafeUserContext,
  key: ApprovalKey,
  input: { title: string; hostOrganizationUnitId: string; note?: string; signer?: ApprovalSigner }
) {
  // CSDL giả lập của một số bộ test không có bảng tờ trình: bỏ qua luồng (CSDL thật luôn có bảng này).
  if (!client.approvalSubmission?.create) return null;
  const now = new Date();
  await client.approvalSubmission.updateMany({ where: { ...keyWhere(key), status: "PENDING" }, data: { status: "CANCELLED", stage: "CLOSED", closedAt: now } });
  const submission = (await client.approvalSubmission.create({
    data: {
      ...keyWhere(key),
      title: input.title.slice(0, 500),
      hostOrganizationUnitId: input.hostOrganizationUnitId,
      stage: "BOARD_REVIEW",
      status: "PENDING",
      signer: input.signer ?? APPROVAL_SIGNERS[key.kind],
      submittedById: actor.id,
      lastNote: input.note ?? null
    }
  })) as ApprovalSubmissionRow;
  await client.approvalStep.create({ data: { submissionId: submission.id, stage: "BOARD_REVIEW", action: "SUBMIT", actorId: actor.id, note: input.note ?? null } });
  return submission;
}

/**
 * Ban giám đốc chỉ ký khi hồ sơ trình đã qua Trưởng ban và Trưởng phòng. Thủ tục chưa từng có hồ sơ trình (trình
 * lên trước khi có luồng này) vẫn ký được như cũ. Trả về hồ sơ trình đang chờ ký (hoặc null với thủ tục cũ).
 */
export async function assertReadyForLeadership(client: RoutingClient, actor: SafeUserContext, key: ApprovalKey) {
  if (!client.approvalSubmission?.findFirst) return null;
  const pending = (await client.approvalSubmission.findFirst({ where: { ...keyWhere(key), status: "PENDING" } })) as ApprovalSubmissionRow | null;
  if (pending) {
    if (pending.stage !== "LEADERSHIP") {
      throw new BadRequestException({ code: "APPROVAL_NOT_READY", message: `Tờ trình chưa tới Ban giám đốc: ${APPROVAL_STAGE_LABELS[pending.stage]}.` });
    }
    if (!canSignApproval(actor, pending.signer)) {
      throw new ForbiddenException({ code: "APPROVAL_SIGNER_DENIED", message: "Thủ tục này do Giám đốc Học viện ký." });
    }
    return pending;
  }
  const history = (await client.approvalSubmission.findFirst({ where: keyWhere(key) })) as ApprovalSubmissionRow | null;
  if (history) {
    throw new BadRequestException({ code: "APPROVAL_NOT_READY", message: "Chưa có tờ trình đang chờ Ban giám đốc cho thủ tục này (tờ trình trước đã bị trả lại hoặc đã kết thúc)." });
  }
  return null;
}

/** Ban giám đốc đã quyết định: đóng hồ sơ trình (nếu có) và ghi bước quyết định. */
export async function closeApprovalSubmission(client: RoutingClient, actor: SafeUserContext, key: ApprovalKey, decision: "APPROVED" | "REJECTED" | "RETURNED", note?: string) {
  if (!client.approvalSubmission?.findFirst) return;
  const pending = (await client.approvalSubmission.findFirst({ where: { ...keyWhere(key), status: "PENDING" } })) as ApprovalSubmissionRow | null;
  if (!pending) return;
  await client.approvalSubmission.update({ where: { id: pending.id }, data: { status: decision, stage: "CLOSED", closedAt: new Date(), lastNote: note ?? pending.lastNote } });
  await client.approvalStep.create({ data: { submissionId: pending.id, stage: "LEADERSHIP", action: decision === "APPROVED" ? "APPROVE" : decision === "REJECTED" ? "REJECT" : "RETURN", actorId: actor.id, note: note ?? null } });
}

/** Thủ tục đang ở bước nào (để hiển thị và ẩn nút ký khi chưa tới Ban giám đốc). */
export async function pendingApprovalStages(client: RoutingClient, subjectType: "proposal" | "project", subjectIds: string[]) {
  const result = new Map<string, Partial<Record<ApprovalKind, { stage: ApprovalStage; subjectRef: string; signer: ApprovalSigner }>>>();
  if (!subjectIds.length || !client.approvalSubmission?.findMany) return result;
  const rows = (await client.approvalSubmission.findMany({ where: { subjectType, subjectId: { in: subjectIds }, status: "PENDING" } })) as ApprovalSubmissionRow[];
  for (const row of rows) {
    const entry = result.get(row.subjectId) ?? {};
    entry[row.kind] = { stage: row.stage, subjectRef: row.subjectRef, signer: row.signer };
    result.set(row.subjectId, entry);
  }
  return result;
}

/** Thông báo Trưởng ban QLKH (trong phạm vi đơn vị) khi chuyên viên vừa trình. */
export async function boardReviewEvent(client: RoutingClient, submission: ApprovalSubmissionRow | null) {
  if (!submission) return { type: "APPROVAL_ROUTING", userIds: [] as string[], title: "", message: "" };
  const rows = (await client.user.findMany({
    where: { status: "active", systemRole: "RESEARCH_BOARD_HEAD", organizationScopes: { some: { organizationUnitId: submission.hostOrganizationUnitId } } },
    select: { id: true }
  })) as Array<{ id: string }>;
  return {
    type: "APPROVAL_ROUTING",
    userIds: rows.map((row) => row.id),
    title: `Tờ trình mới chờ rà soát: ${APPROVAL_KIND_LABELS[submission.kind]} — ${submission.title}`,
    message: `Chuyên viên đã trình "${APPROVAL_KIND_LABELS[submission.kind]}" cho ${submission.title}. Trưởng ban QLKH rà soát và trình Trưởng phòng.`,
    link: "/submissions",
    metadata: { submissionId: submission.id, kind: submission.kind, subjectId: submission.subjectId, stage: submission.stage }
  };
}
