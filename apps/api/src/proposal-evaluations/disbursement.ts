import { BadRequestException } from "@nestjs/common";

/**
 * Dữ liệu giải ngân & quyết toán theo mốc của một đề tài.
 *
 * Mọi giá trị ghi vào cơ sở dữ liệu đều đi qua `readDisbursementInput`: chỉ các trường đã biết được
 * giữ lại, số tiền phải là số hữu hạn không âm, trạng thái thuộc danh sách cho phép. Tổng tiền do
 * máy chủ tự tính từ các mốc và khoản chi — không nhận từ người dùng — nên không thể khai sai tổng.
 */

export const DISBURSEMENT_MILESTONE_STATUSES = ["PENDING", "DISBURSED", "SETTLED"] as const;
export const SETTLEMENT_STATUSES = ["PENDING", "PARTIALLY_SETTLED", "COMPLETED"] as const;

type MilestoneStatus = (typeof DISBURSEMENT_MILESTONE_STATUSES)[number];
type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export type DisbursementAttachment = {
  id: string;
  fileName: string;
  fileSize?: number;
  uploadedAt: string;
  uploadedByName?: string;
};

export type DisbursementMilestone = {
  id: string;
  name: string;
  percentage: number;
  expectedAmount: number;
  disbursedAmount: number;
  status: MilestoneStatus;
  disbursedDate?: string;
  settledDate?: string;
  evidenceNotes?: string;
  attachments: DisbursementAttachment[];
};

export type DisbursementCostItem = {
  code: string;
  name: string;
  allocatedAmount: number;
  spentAmount: number;
  settledAmount: number;
};

export type DisbursementInput = {
  milestones: DisbursementMilestone[];
  costItems: DisbursementCostItem[];
  settlementStatus: SettlementStatus;
  notes: string;
};

export type DisbursementRecord = DisbursementInput & {
  totalBudget: number;
  totalDisbursed: number;
  totalSettled: number;
  lastUpdatedAt?: string;
  lastUpdatedById?: string;
  lastUpdatedBy?: string;
};

const MAX_MILESTONES = 24;
const MAX_COST_ITEMS = 50;
const MAX_ATTACHMENTS = 20;
// 10^13 VNĐ: đủ lớn cho mọi đề tài, chặn giá trị vô lý hoặc tràn số.
const MAX_AMOUNT = 10_000_000_000_000;

function invalid(message: string): never {
  throw new BadRequestException({ code: "DISBURSEMENT_INVALID", message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, field: string, maxLength: number, required = true): string {
  if (value === undefined || value === null || value === "") {
    if (required) invalid(`${field} là bắt buộc.`);
    return "";
  }
  if (typeof value !== "string") invalid(`${field} không hợp lệ.`);
  const trimmed = value.trim();
  if (required && !trimmed) invalid(`${field} là bắt buộc.`);
  if (trimmed.length > maxLength) invalid(`${field} không được vượt quá ${maxLength} ký tự.`);
  return trimmed;
}

function readAmount(value: unknown, field: string): number {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    invalid(`${field} phải là số tiền không âm hợp lệ.`);
  }
  return Math.round(amount);
}

function readPercentage(value: unknown, field: string): number {
  const percentage = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    invalid(`${field} phải nằm trong khoảng 0–100.`);
  }
  return percentage;
}

function readOptionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || Number.isNaN(new Date(value).valueOf())) invalid(`${field} không phải ngày hợp lệ.`);
  return value.slice(0, 32);
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(`${field} không hợp lệ.`);
  return value as T;
}

function readAttachments(value: unknown, field: string): DisbursementAttachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) invalid(`${field} không hợp lệ (tối đa ${MAX_ATTACHMENTS} tệp).`);
  return value.map((item, index) => {
    if (!isRecord(item)) invalid(`${field} #${index + 1} không hợp lệ.`);
    const attachment: DisbursementAttachment = {
      id: readString(item.id, `${field} #${index + 1}: mã tệp`, 100),
      fileName: readString(item.fileName, `${field} #${index + 1}: tên tệp`, 255),
      uploadedAt: readOptionalDate(item.uploadedAt, `${field} #${index + 1}: ngày tải lên`) ?? new Date().toISOString()
    };
    if (item.fileSize !== undefined && item.fileSize !== null) attachment.fileSize = readAmount(item.fileSize, `${field} #${index + 1}: dung lượng`);
    const uploadedByName = readString(item.uploadedByName, `${field} #${index + 1}: người tải`, 160, false);
    if (uploadedByName) attachment.uploadedByName = uploadedByName;
    return attachment;
  });
}

function readMilestone(value: unknown, index: number): DisbursementMilestone {
  const label = `Mốc giải ngân #${index + 1}`;
  if (!isRecord(value)) invalid(`${label} không hợp lệ.`);
  const expectedAmount = readAmount(value.expectedAmount, `${label}: số tiền dự kiến`);
  const disbursedAmount = readAmount(value.disbursedAmount ?? 0, `${label}: số tiền đã giải ngân`);
  if (disbursedAmount > expectedAmount) invalid(`${label}: số tiền đã giải ngân không được lớn hơn số tiền dự kiến.`);
  const status = readEnum(value.status ?? "PENDING", DISBURSEMENT_MILESTONE_STATUSES, `${label}: trạng thái`);
  const disbursedDate = readOptionalDate(value.disbursedDate, `${label}: ngày giải ngân`);
  const settledDate = readOptionalDate(value.settledDate, `${label}: ngày quyết toán`);
  if (status !== "PENDING" && disbursedAmount === 0) invalid(`${label}: mốc đã giải ngân/quyết toán phải có số tiền đã giải ngân.`);

  const milestone: DisbursementMilestone = {
    id: readString(value.id, `${label}: mã mốc`, 64),
    name: readString(value.name, `${label}: tên mốc`, 300),
    percentage: readPercentage(value.percentage ?? 0, `${label}: tỷ lệ`),
    expectedAmount,
    disbursedAmount,
    status,
    attachments: readAttachments(value.attachments, `${label}: tệp minh chứng`)
  };
  if (disbursedDate) milestone.disbursedDate = disbursedDate;
  if (settledDate) milestone.settledDate = settledDate;
  const evidenceNotes = readString(value.evidenceNotes, `${label}: ghi chú minh chứng`, 2000, false);
  if (evidenceNotes) milestone.evidenceNotes = evidenceNotes;
  return milestone;
}

function readCostItem(value: unknown, index: number): DisbursementCostItem {
  const label = `Khoản chi #${index + 1}`;
  if (!isRecord(value)) invalid(`${label} không hợp lệ.`);
  const allocatedAmount = readAmount(value.allocatedAmount, `${label}: kinh phí phân bổ`);
  const spentAmount = readAmount(value.spentAmount ?? 0, `${label}: đã chi`);
  const settledAmount = readAmount(value.settledAmount ?? 0, `${label}: đã quyết toán`);
  if (settledAmount > spentAmount) invalid(`${label}: số đã quyết toán không được lớn hơn số đã chi.`);
  return {
    code: readString(value.code, `${label}: mã khoản chi`, 64),
    name: readString(value.name, `${label}: tên khoản chi`, 300),
    allocatedAmount,
    spentAmount,
    settledAmount
  };
}

/** Kiểm tra và chuẩn hoá dữ liệu người dùng gửi lên. Trường lạ bị bỏ qua, không bao giờ được lưu. */
export function readDisbursementInput(input: unknown, totalBudget: number): DisbursementInput {
  if (!isRecord(input)) invalid("Dữ liệu giải ngân không hợp lệ.");
  if (!Array.isArray(input.milestones) || input.milestones.length > MAX_MILESTONES) {
    invalid(`Danh sách mốc giải ngân không hợp lệ (tối đa ${MAX_MILESTONES} mốc).`);
  }
  const costItemsInput = input.costItems ?? [];
  if (!Array.isArray(costItemsInput) || costItemsInput.length > MAX_COST_ITEMS) {
    invalid(`Danh sách khoản chi không hợp lệ (tối đa ${MAX_COST_ITEMS} khoản).`);
  }

  const milestones = input.milestones.map(readMilestone);
  const costItems = costItemsInput.map(readCostItem);

  const ids = new Set<string>();
  for (const milestone of milestones) {
    if (ids.has(milestone.id)) invalid(`Mã mốc giải ngân bị trùng: ${milestone.id}.`);
    ids.add(milestone.id);
  }
  const codes = new Set<string>();
  for (const item of costItems) {
    if (codes.has(item.code)) invalid(`Mã khoản chi bị trùng: ${item.code}.`);
    codes.add(item.code);
  }

  const totals = computeDisbursementTotals(milestones, costItems);
  if (totalBudget > 0 && totals.totalDisbursed > totalBudget) {
    invalid("Tổng số tiền đã giải ngân vượt quá kinh phí được duyệt của đề tài.");
  }

  const settlementStatus = readEnum(input.settlementStatus ?? "PENDING", SETTLEMENT_STATUSES, "Trạng thái quyết toán");
  if (settlementStatus === "COMPLETED" && milestones.some((milestone) => milestone.status !== "SETTLED")) {
    invalid("Chỉ hoàn tất quyết toán khi mọi mốc đã được quyết toán.");
  }

  return {
    milestones,
    costItems,
    settlementStatus,
    notes: readString(input.notes, "Ghi chú", 4000, false)
  };
}

/**
 * Ghi ngày giải ngân/quyết toán khi một mốc chuyển trạng thái mà người dùng không nhập ngày: giữ ngày
 * đã lưu trước đó của chính mốc đó, nếu chưa có thì lấy ngày hiện tại. Mốc trở lại PENDING thì xoá ngày.
 */
export function stampMilestoneDates(milestones: DisbursementMilestone[], previous: unknown, now = new Date()): DisbursementMilestone[] {
  const previousById = new Map<string, Record<string, unknown>>();
  if (isRecord(previous) && Array.isArray(previous.milestones)) {
    for (const item of previous.milestones) if (isRecord(item) && typeof item.id === "string") previousById.set(item.id, item);
  }
  const today = now.toISOString().slice(0, 10);
  return milestones.map((milestone) => {
    const before = previousById.get(milestone.id);
    const stamped = { ...milestone };
    if (stamped.status === "PENDING") {
      delete stamped.disbursedDate;
      delete stamped.settledDate;
      return stamped;
    }
    stamped.disbursedDate ??= typeof before?.disbursedDate === "string" ? before.disbursedDate : today;
    if (stamped.status === "SETTLED") stamped.settledDate ??= typeof before?.settledDate === "string" ? before.settledDate : today;
    else delete stamped.settledDate;
    return stamped;
  });
}

export function computeDisbursementTotals(milestones: DisbursementMilestone[], costItems: DisbursementCostItem[]) {
  return {
    totalDisbursed: milestones.reduce((sum, milestone) => sum + milestone.disbursedAmount, 0),
    totalSettled: costItems.reduce((sum, item) => sum + item.settledAmount, 0)
  };
}

/** Kinh phí được duyệt lấy từ dữ liệu thật của đề xuất; không có thì là 0 (không bịa con số mặc định). */
export function readApprovedBudget(budgetMetadata: unknown): number {
  const amount = isRecord(budgetMetadata) ? Number(budgetMetadata.amount) : NaN;
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

export function emptyDisbursement(totalBudget: number): DisbursementRecord {
  return {
    totalBudget,
    totalDisbursed: 0,
    totalSettled: 0,
    settlementStatus: "PENDING",
    milestones: [],
    costItems: [],
    notes: ""
  };
}
