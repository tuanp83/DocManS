import { BadRequestException } from "@nestjs/common";
import { type DisbursementCostItem, type DisbursementMilestone, type DisbursementRecord } from "../proposal-evaluations/disbursement.js";

/**
 * Chuyển dữ liệu nghiệm thu / kinh phí / thanh lý từ bản ghi CSDL sang dạng trả về cho giao diện.
 * Số tiền lưu BIGINT (đồng) và luôn < 10^13 nên đổi sang number không mất chính xác.
 */

type AnyRecord = Record<string, any>;

export function money(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") return Number(value) || 0;
  return 0;
}

function day(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value) return value.slice(0, 10);
  return undefined;
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export const ACCEPTANCE_ROUND_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Đã nộp hồ sơ nghiệm thu",
  RETURNED: "Hồ sơ bị trả lại",
  COUNCIL_PROPOSED: "Đã đề xuất hội đồng",
  COUNCIL_ESTABLISHED: "Hội đồng đã được thành lập",
  REVISION_REQUIRED: "Hội đồng yêu cầu hoàn thiện",
  REVISION_SUBMITTED: "Đã nộp bản hoàn thiện",
  PASSED: "Nghiệm thu đạt",
  FAILED: "Nghiệm thu không đạt"
};

export function toAcceptanceResponse(row: AnyRecord) {
  return {
    id: row.id,
    round: row.round,
    status: row.status,
    statusLabel: ACCEPTANCE_ROUND_STATUS_LABELS[row.status] ?? row.status,
    dossier: row.dossier ?? {},
    revisionDossier: row.revisionDossier ?? null,
    returnReason: row.returnReason ?? null,
    councilType: row.councilType ?? null,
    councilMembers: Array.isArray(row.councilMembers) ? row.councilMembers : [],
    meetingDate: day(row.meetingDate) ?? null,
    meetingLocation: row.meetingLocation ?? null,
    tentativeAgenda: row.tentativeAgenda ?? null,
    decisionNumber: row.decisionNumber ?? null,
    decisionDate: day(row.decisionDate) ?? null,
    evaluationResult: row.evaluationResult ?? null,
    resolution: row.resolution ?? null,
    minutesNotes: row.minutesNotes ?? null,
    revisionNote: row.revisionNote ?? null,
    legacy: !!row.legacySource,
    submittedBy: row.submittedBy?.displayName ?? null,
    establishedBy: row.establishedBy?.displayName ?? null,
    minutesRecordedBy: row.minutesRecordedBy?.displayName ?? null,
    submittedAt: iso(row.submittedAt),
    councilProposedAt: iso(row.councilProposedAt),
    establishedAt: iso(row.establishedAt),
    evaluatedAt: iso(row.evaluatedAt),
    completedAt: iso(row.completedAt)
  };
}

export function toFinanceSummary(finance: AnyRecord | null | undefined) {
  if (!finance) return null;
  return {
    totalBudget: money(finance.totalBudget),
    totalDisbursed: money(finance.totalDisbursed),
    totalSettled: money(finance.totalSettled),
    settlementStatus: finance.settlementStatus,
    version: finance.version ?? 0,
    updatedAt: iso(finance.updatedAt)
  };
}

export function toLiquidationResponse(row: AnyRecord) {
  const totalDisbursed = money(row.totalDisbursed);
  const totalSettled = money(row.totalSettled);
  const recoveredAmount = money(row.recoveredAmount);
  return {
    status: row.status,
    outcome: row.outcome,
    liquidationNumber: row.liquidationNumber ?? null,
    liquidationDate: day(row.liquidationDate) ?? null,
    approvedBudget: money(row.approvedBudget),
    totalDisbursed,
    totalSettled,
    recoveredAmount,
    outstanding: totalDisbursed - totalSettled - recoveredAmount,
    productsHandedOver: row.productsHandedOver ?? null,
    notes: row.notes ?? null,
    evidenceFileIds: Array.isArray(row.evidenceFileIds) ? row.evidenceFileIds : [],
    preparedBy: row.preparedBy?.displayName ?? null,
    preparedAt: iso(row.preparedAt),
    approvedBy: row.approvedBy?.displayName ?? null,
    approvedAt: iso(row.approvedAt)
  };
}

/** Bản ghi kinh phí theo đúng dạng giao diện giải ngân đã dùng (DisbursementRecord). */
export function toDisbursementRecord(finance: AnyRecord | null, tranches: AnyRecord[], costItems: AnyRecord[], fallbackBudget: number): DisbursementRecord & { version: number } {
  const milestones: DisbursementMilestone[] = tranches.map((row) => {
    const milestone: DisbursementMilestone = {
      id: row.trancheKey,
      name: row.name,
      percentage: Number(row.percentage) || 0,
      expectedAmount: money(row.expectedAmount),
      disbursedAmount: money(row.disbursedAmount),
      status: row.status,
      attachments: Array.isArray(row.attachments) ? row.attachments : []
    };
    const disbursedDate = day(row.disbursedDate);
    const settledDate = day(row.settledDate);
    if (disbursedDate) milestone.disbursedDate = disbursedDate;
    if (settledDate) milestone.settledDate = settledDate;
    if (row.evidenceNotes) milestone.evidenceNotes = row.evidenceNotes;
    if (row.projectMilestoneId) milestone.projectMilestoneId = row.projectMilestoneId;
    return milestone;
  });
  const items: DisbursementCostItem[] = costItems.map((row) => ({
    code: row.code,
    name: row.name,
    allocatedAmount: money(row.allocatedAmount),
    spentAmount: money(row.spentAmount),
    settledAmount: money(row.settledAmount)
  }));
  return {
    milestones,
    costItems: items,
    settlementStatus: (finance?.settlementStatus ?? "PENDING") as DisbursementRecord["settlementStatus"],
    notes: finance?.notes ?? "",
    totalBudget: finance ? money(finance.totalBudget) : fallbackBudget,
    totalDisbursed: finance ? money(finance.totalDisbursed) : 0,
    totalSettled: finance ? money(finance.totalSettled) : 0,
    lastUpdatedAt: iso(finance?.updatedAt) ?? undefined,
    lastUpdatedById: finance?.updatedById ?? undefined,
    lastUpdatedBy: finance?.updatedBy?.displayName ?? undefined,
    version: finance?.version ?? 0
  };
}

/** Số tiền nhập tay (thu hồi): số nguyên không âm, tối đa 10^13 đồng. */
export function readMoney(value: unknown, field: string): number {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value === undefined || value === null || value === "" ? 0 : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 10_000_000_000_000) {
    throw new BadRequestException({ code: "LIQUIDATION_INVALID", message: `${field} phải là số tiền không âm hợp lệ.` });
  }
  return Math.round(amount);
}

/** Danh sách mã tệp (UUID) không trùng, tối đa `max` tệp. */
export function readFileIds(value: unknown, field: string, max = 20): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 100)) {
    throw new BadRequestException({ message: `${field} không hợp lệ (tối đa ${max} tệp).` });
  }
  return [...new Set(value.map((item: string) => item.trim()))];
}

/** Ngày dạng YYYY-MM-DD (bắt buộc hoặc tuỳ chọn). */
export function readDay(value: unknown, field: string, required = false): Date | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadRequestException({ message: `${field} là bắt buộc.` });
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new BadRequestException({ message: `${field} không phải ngày hợp lệ.` });
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new BadRequestException({ message: `${field} không phải ngày hợp lệ.` });
  return date;
}

/** Văn bản bắt buộc có giới hạn độ dài. */
export function readRequiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException({ message: `${field} là bắt buộc.` });
  if (value.trim().length > maxLength) throw new BadRequestException({ message: `${field} không được vượt quá ${maxLength} ký tự.` });
  return value.trim();
}

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Chưa nộp minh chứng",
  SUBMITTED: "Đã nộp, chờ lập tổ chuyên gia",
  UNDER_REVIEW: "Tổ chuyên gia đang nghiệm thu",
  PASSED: "Đạt",
  FAILED: "Không đạt — cần hoàn thiện và nộp lại"
};

export function toProductResponse(row: AnyRecord) {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    productForm: row.productForm,
    requirements: row.requirements ?? null,
    milestoneId: row.milestoneId ?? null,
    status: row.status,
    statusLabel: PRODUCT_STATUS_LABELS[row.status] ?? row.status,
    submission: row.submission ?? null,
    reviews: (row.reviews ?? []).map((review: AnyRecord) => ({
      id: review.id,
      round: review.round,
      status: review.status,
      panelMembers: Array.isArray(review.panelMembers) ? review.panelMembers : [],
      reviewDate: day(review.reviewDate) ?? null,
      location: review.location ?? null,
      submissionSnapshot: review.submissionSnapshot ?? null,
      result: review.result ?? null,
      conclusion: review.conclusion ?? null,
      minutesFileIds: Array.isArray(review.minutesFileIds) ? review.minutesFileIds : [],
      formedBy: review.formedBy?.displayName ?? null,
      recordedBy: review.recordedBy?.displayName ?? null,
      formedAt: iso(review.formedAt),
      concludedAt: iso(review.concludedAt)
    }))
  };
}

const VIETNAM_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Số ngày còn lại (theo lịch Việt Nam) tới một ngày DATE; âm là đã quá hạn. */
export function daysUntil(date: Date, now: Date) {
  return Math.floor(date.getTime() / DAY_MS) - Math.floor((now.getTime() + VIETNAM_OFFSET_MS) / DAY_MS);
}

export function toSuperiorResponse(row: AnyRecord, now = new Date()) {
  const dueDate = row.dueDate instanceof Date ? row.dueDate : new Date(row.dueDate);
  return {
    level: row.level,
    status: row.status,
    facilityAcceptedOn: day(row.facilityAcceptedOn) ?? null,
    dueDate: day(row.dueDate) ?? null,
    daysLeft: row.status === "PREPARING" ? daysUntil(dueDate, now) : null,
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    letterNumber: row.letterNumber ?? null,
    letterDate: day(row.letterDate) ?? null,
    recipient: row.recipient ?? null,
    letterFileIds: Array.isArray(row.letterFileIds) ? row.letterFileIds : [],
    sentAt: iso(row.sentAt),
    sentBy: row.sentBy?.displayName ?? null,
    sentLate: row.sentAt ? daysUntil(dueDate, row.sentAt instanceof Date ? row.sentAt : new Date(row.sentAt)) < 0 : false,
    result: row.result ?? null,
    resultDecisionNumber: row.resultDecisionNumber ?? null,
    resultDate: day(row.resultDate) ?? null,
    resultNote: row.resultNote ?? null,
    resultFileIds: Array.isArray(row.resultFileIds) ? row.resultFileIds : [],
    resultRecordedBy: row.resultRecordedBy?.displayName ?? null
  };
}
