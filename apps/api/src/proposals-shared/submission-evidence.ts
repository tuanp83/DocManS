import { BadRequestException } from "@nestjs/common";

/**
 * Bằng chứng lần nộp (mang từ thanhdotien278/DocManS, "golden flow"): mỗi vòng đánh giá gắn với đúng một sự kiện
 * nộp hồ sơ bất biến (bản chụp thành viên, tệp, danh mục hồ sơ bắt buộc). Kiểm tra đầy đủ, phân công, phiếu,
 * bản tổng hợp và quyết định đều ghi `submissionEventId` của vòng đó, nên một lần nộp lại sau bổ sung luôn mở
 * vòng mới: phiếu và kết quả kiểm tra của lần nộp cũ không còn được tính.
 */

export type SubmissionEventLike = {
  id: string;
  proposalId?: string;
  toStatus?: string | null;
  submittedAt: Date;
  snapshot?: unknown;
};

export type SubmissionEvidence = { eventId: string; submittedAt: Date; snapshot: Record<string, unknown> };

type ProposalLike = { id: string; submittedAt: Date | null };

const SUBMISSION_STATUSES = ["submitted", "resubmitted"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Bản chụp nộp hồ sơ thật (không phải sự kiện kiểm tra đầy đủ hay sự kiện quy trình khác). */
export function isSubmissionSnapshot(snapshot: unknown): snapshot is Record<string, unknown> {
  return isRecord(snapshot) && !snapshot.kind && Array.isArray(snapshot.members) && Array.isArray(snapshot.attachments) && Array.isArray(snapshot.requiredPackage);
}

/** Hàm thuần: lần nộp hiện tại của hồ sơ trong danh sách sự kiện (mới nhất, không trước `proposal.submittedAt`). */
export function currentSubmissionFromEvents(proposal: ProposalLike, events: SubmissionEventLike[]): SubmissionEvidence | null {
  if (!proposal.submittedAt) return null;
  const submittedAt = proposal.submittedAt.getTime();
  const event = events
    .filter((item) => (item.proposalId === undefined || item.proposalId === proposal.id) && SUBMISSION_STATUSES.includes(String(item.toStatus)) && item.submittedAt.getTime() >= submittedAt && isSubmissionSnapshot(item.snapshot))
    .sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())[0];
  return event ? { eventId: event.id, submittedAt: event.submittedAt, snapshot: event.snapshot as Record<string, unknown> } : null;
}

/** Hàm thuần: đã có kết quả kiểm tra đầy đủ (đạt) cho đúng lần nộp này chưa. */
export function hasCompletenessCheckForEvent(events: SubmissionEventLike[], evidence: SubmissionEvidence) {
  return events.some((item) => {
    const snapshot = item.snapshot as { kind?: unknown; submissionEventId?: unknown; readiness?: { ready?: unknown } } | null | undefined;
    return snapshot?.kind === "completeness_check" && snapshot.submissionEventId === evidence.eventId && snapshot.readiness?.ready === true && item.submittedAt.getTime() >= evidence.submittedAt.getTime();
  });
}

// Kiểu lỏng có chủ ý: nhận cả PrismaService, client giao dịch và CSDL giả lập trong test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventReader = { proposalSubmissionEvent: { findMany: (...args: any[]) => Promise<any> } };

async function readEvents(prisma: EventReader, proposal: ProposalLike) {
  return (await prisma.proposalSubmissionEvent.findMany({
    where: { proposalId: proposal.id, submittedAt: { gte: proposal.submittedAt ?? new Date(0) } },
    select: { id: true, proposalId: true, toStatus: true, submittedAt: true, snapshot: true }
  })) as SubmissionEventLike[];
}

export async function findCurrentSubmission(prisma: EventReader, proposal: ProposalLike) {
  if (!proposal.submittedAt) return null;
  return currentSubmissionFromEvents(proposal, await readEvents(prisma, proposal));
}

/** Lần nộp hiện tại và kết quả kiểm tra đầy đủ của nó (null nếu chưa xác định được lần nộp). */
export async function readCompletenessState(prisma: EventReader, proposal: ProposalLike) {
  if (!proposal.submittedAt) return { evidence: null, checked: false };
  const events = await readEvents(prisma, proposal);
  const evidence = currentSubmissionFromEvents(proposal, events);
  return { evidence, checked: !!evidence && hasCompletenessCheckForEvent(events, evidence) };
}

/** Mọi thao tác của vòng đánh giá cần kết quả kiểm tra đầy đủ của đúng lần nộp hiện tại; thiếu thì từ chối. */
export async function assertCurrentCompletenessEvidence(prisma: EventReader, proposal: ProposalLike): Promise<SubmissionEvidence> {
  if (!proposal.submittedAt) throw new BadRequestException({ code: "CONTEXT_UNRESOLVED", message: "Không xác định được lần nộp hiện tại." });
  const { evidence, checked } = await readCompletenessState(prisma, proposal);
  if (!evidence) throw new BadRequestException({ code: "CONTEXT_UNRESOLVED", message: "Không xác định được bằng chứng lần nộp hiện tại." });
  if (!checked) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Cần xác nhận hồ sơ đầy đủ cho đúng phiên bản nộp hiện tại trước khi tiếp tục vòng đánh giá." });
  return evidence;
}

type RoundAssignment = { id: string; status: string; reviewedSubmissionEventId?: string | null };
type RoundReview = { id: string; assignmentId: string; status: string; submissionEventId?: string | null };

/** Phân công thuộc vòng hiện tại (không tính phân công đã thu hồi và phân công của lần nộp cũ). */
export function currentRoundAssignments<T extends RoundAssignment>(assignments: T[], submissionEventId: string) {
  return assignments.filter((assignment) => assignment.reviewedSubmissionEventId === submissionEventId && assignment.status !== "revoked");
}

/** Phiếu của vòng hiện tại: ghi cho đúng lần nộp và thuộc một phân công của vòng. */
export function currentRoundReviews<T extends RoundReview>(reviews: T[], roundAssignments: RoundAssignment[], submissionEventId: string) {
  const ids = new Set(roundAssignments.map((assignment) => assignment.id));
  return reviews.filter((review) => review.submissionEventId === submissionEventId && ids.has(review.assignmentId));
}

/** So khớp danh sách phân công/phiếu đã chụp trong gói với vòng hiện tại. */
export function sameEvidenceIds(evidence: Record<string, unknown> | null | undefined, assignments: RoundAssignment[], reviews: RoundReview[]) {
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").sort() : []);
  return !!evidence &&
    JSON.stringify(ids(evidence.assignmentIds)) === JSON.stringify(assignments.map((assignment) => assignment.id).sort()) &&
    JSON.stringify(ids(evidence.reviewIds)) === JSON.stringify(reviews.filter((review) => review.status === "submitted").map((review) => review.id).sort());
}
