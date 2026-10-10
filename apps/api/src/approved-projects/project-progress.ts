/**
 * Chỉ số tiến độ nhiệm vụ KH&CN (Đợt 1 — docs/design/quan-ly-tien-do-nhiem-vu.md, mục 4).
 *
 * Hàm thuần, không phụ thuộc NestJS/Prisma, để test trực tiếp và để mọi nơi (chi tiết đề tài, danh sách theo
 * dõi, "Việc của tôi") dùng chung một công thức.
 */

export type HealthLevel = "green" | "amber" | "red";

export const HEALTH_LEVELS: readonly HealthLevel[] = ["green", "amber", "red"];

export const HEALTH_LEVEL_LABELS: Record<HealthLevel, string> = { green: "Đúng tiến độ", amber: "Cần chú ý", red: "Chậm tiến độ" };

export type HealthThresholds = {
  /** SPI dưới ngưỡng này: Vàng. */
  amberSpi: number;
  /** SPI dưới ngưỡng này: Đỏ. */
  redSpi: number;
  /** Mốc trễ quá số ngày này: Vàng. */
  amberOverdueDays: number;
  /** Mốc trễ quá số ngày này: Đỏ. */
  redOverdueDays: number;
  /** Số kỳ báo cáo trễ từ mức này: Đỏ (1 kỳ: Vàng). */
  redLateReports: number;
  /** Chỉ tính SPI khi tiến độ kế hoạch đạt ít nhất mức này (%). */
  minPlannedForSpi: number;
};

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  amberSpi: 0.9,
  redSpi: 0.75,
  amberOverdueDays: 7,
  redOverdueDays: 30,
  redLateReports: 2,
  minPlannedForSpi: 5
};

/** Trạng thái đề tài được đánh giá sức khoẻ. */
export const HEALTH_APPLICABLE_STATUSES = ["executing", "paused"];

export type ProgressMilestoneInput = {
  id: string;
  title: string;
  dueDate: Date | string;
  status: string;
  progressPercent?: number | null;
  weightPercent?: number | null;
  plannedStartDate?: Date | string | null;
  completedAt?: Date | string | null;
};

export type BaselineMilestone = { milestoneId: string; title: string; dueDate: string; weightPercent: number | null; plannedStartDate?: string | null };

export type BaselineInput = { version: number; startDate?: Date | string | null; endDate?: Date | string | null; milestones: BaselineMilestone[] };

export type ProgressInput = {
  today: Date;
  status: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  milestones: ProgressMilestoneInput[];
  /** Kế hoạch gốc mới nhất (dùng tính tiến độ kế hoạch). */
  baseline?: BaselineInput | null;
  /** Kế hoạch gốc phiên bản 1 (dùng tính độ trễ so với kế hoạch ban đầu). */
  originalBaseline?: BaselineInput | null;
  checkpoints?: Array<{ id: string; dueDate: Date | string; status: string }>;
  reports?: Array<{ checkpointId?: string | null; status: string }>;
  thresholds?: Partial<HealthThresholds>;
};

export type MilestoneProgressRow = {
  id: string;
  title: string;
  status: string;
  weightPercent: number;
  progressPercent: number;
  currentDueDate: string;
  baselineDueDate: string | null;
  originalDueDate: string | null;
  completedAt: string | null;
  /** Hạn hiện tại (hoặc ngày hoàn thành) trừ hạn trong kế hoạch gốc v1. Dương = trễ. */
  slipDays: number | null;
  /** Số ngày quá hạn nếu mốc chưa hoàn thành; 0 nếu chưa đến hạn. */
  overdueDays: number;
};

export type ProjectProgress = {
  asOf: string;
  applicable: boolean;
  weightsConfigured: boolean;
  baselineVersion: number | null;
  baselineMissing: boolean;
  plannedPercent: number;
  actualPercent: number;
  spi: number | null;
  maxDaysOverdue: number;
  overdueMilestones: number;
  lateReports: number;
  endDatePassed: boolean;
  level: HealthLevel | null;
  reasons: string[];
  milestones: MilestoneProgressRow[];
};

const DAY = 86_400_000;

/** Giờ Việt Nam (UTC+7, không có giờ mùa hè): "hôm nay" và thời điểm hoàn thành tính theo ngày ở Việt Nam. */
export const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Số thứ tự ngày của một NGÀY lịch (cột @db.Date, chuỗi "YYYY-MM-DD" hoặc ISO lúc 00:00Z). */
export function calendarDayIndex(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Math.floor(date.getTime() / DAY);
}

/** Số thứ tự ngày (theo giờ Việt Nam) của một THỜI ĐIỂM (bây giờ, lúc hoàn thành). */
export function localDayIndex(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Math.floor((date.getTime() + VIETNAM_OFFSET_MS) / DAY);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function isoDay(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: unknown) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, number));
}

/**
 * Trọng số hiệu lực: dùng trọng số đã khai báo khi MỌI mốc đều có và tổng đúng 100; ngược lại chia đều.
 * Trả về trọng số theo id mốc.
 */
export function effectiveWeights<T extends { id: string; weightPercent?: number | null }>(milestones: T[]) {
  const weights = new Map<string, number>();
  if (!milestones.length) return { weights, configured: false };
  const declared = milestones.map((item) => item.weightPercent);
  const configured = declared.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) && Math.abs(declared.reduce<number>((sum, value) => sum + (value as number), 0) - 100) < 0.001;
  for (const item of milestones) weights.set(item.id, configured ? (item.weightPercent as number) : 100 / milestones.length);
  return { weights, configured };
}

/** Kiểm tra trọng số nhập vào: hoặc không mốc nào có, hoặc mọi mốc đều có và tổng = 100. */
export function validateDeclaredWeights(values: Array<number | null | undefined>) {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (!present.length) return { ok: true as const };
  if (present.length !== values.length) return { ok: false as const, message: "Cần nhập trọng số cho mọi mốc, hoặc để trống tất cả để chia đều." };
  if (present.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100)) return { ok: false as const, message: "Trọng số mỗi mốc phải là số nguyên từ 0 đến 100." };
  const total = (present as number[]).reduce((sum, value) => sum + value, 0);
  if (total !== 100) return { ok: false as const, message: `Tổng trọng số các mốc phải bằng 100 (hiện là ${total}).` };
  return { ok: true as const };
}

/** Kế hoạch gốc dựng từ các mốc hiện hành (dùng khi tạo phiên bản mới hoặc khi chưa có kế hoạch gốc). */
export function baselineFromMilestones(milestones: ProgressMilestoneInput[]): BaselineMilestone[] {
  return [...milestones]
    .sort((left, right) => (toDate(left.dueDate)?.getTime() ?? 0) - (toDate(right.dueDate)?.getTime() ?? 0))
    .map((item) => ({ milestoneId: item.id, title: item.title, dueDate: isoDay(item.dueDate) ?? "", weightPercent: typeof item.weightPercent === "number" ? item.weightPercent : null, plannedStartDate: isoDay(item.plannedStartDate) }));
}

function plannedPercent(baseline: BaselineInput, fallbackStart: Date | null, today: Date) {
  const rows = [...baseline.milestones].filter((item) => toDate(item.dueDate)).sort((left, right) => toDate(left.dueDate)!.getTime() - toDate(right.dueDate)!.getTime());
  const { weights } = effectiveWeights(rows.map((item) => ({ id: item.milestoneId, weightPercent: item.weightPercent })));
  const start = toDate(baseline.startDate) ?? fallbackStart;
  const now = localDayIndex(today);
  let total = 0;
  let previousDue: Date | null = null;
  for (const item of rows) {
    const due = toDate(item.dueDate)!;
    const windowStart = toDate(item.plannedStartDate) ?? previousDue ?? start ?? due;
    const from = calendarDayIndex(windowStart);
    const to = calendarDayIndex(due);
    const fraction = to <= from ? (now >= to ? 1 : 0) : Math.max(0, Math.min(1, (now - from) / (to - from)));
    total += (weights.get(item.milestoneId) ?? 0) * fraction;
    previousDue = due;
  }
  return total;
}

export function computeProjectProgress(input: ProgressInput): ProjectProgress {
  const thresholds = { ...DEFAULT_HEALTH_THRESHOLDS, ...(input.thresholds ?? {}) };
  const today = input.today;
  const todayIndex = localDayIndex(today);
  const milestones = [...input.milestones].sort((left, right) => (toDate(left.dueDate)?.getTime() ?? 0) - (toDate(right.dueDate)?.getTime() ?? 0));
  const { weights, configured } = effectiveWeights(milestones);
  const baseline = input.baseline ?? null;
  const original = input.originalBaseline ?? baseline;
  const effectiveBaseline: BaselineInput = baseline ?? { version: 0, startDate: input.startDate ?? null, endDate: input.endDate ?? null, milestones: baselineFromMilestones(milestones) };
  const baselineDue = new Map(effectiveBaseline.milestones.map((item) => [item.milestoneId, item.dueDate]));
  const originalDue = new Map((original?.milestones ?? []).map((item) => [item.milestoneId, item.dueDate]));

  let actual = 0;
  let maxDaysOverdue = 0;
  let overdueMilestones = 0;
  const rows: MilestoneProgressRow[] = milestones.map((item) => {
    const completed = item.status === "completed";
    const progress = completed ? 100 : Math.min(clampPercent(item.progressPercent), 99);
    const weight = weights.get(item.id) ?? 0;
    actual += (weight * progress) / 100;
    const due = toDate(item.dueDate);
    const overdueDays = !completed && due && calendarDayIndex(due) < todayIndex ? todayIndex - calendarDayIndex(due) : 0;
    if (overdueDays > 0) overdueMilestones += 1;
    maxDaysOverdue = Math.max(maxDaysOverdue, overdueDays);
    const reference = toDate(originalDue.get(item.id) ?? null);
    const completedAt = completed ? toDate(item.completedAt) : null;
    const endIndex = completedAt ? localDayIndex(completedAt) : due ? calendarDayIndex(due) : null;
    const slipDays = reference && endIndex !== null ? endIndex - calendarDayIndex(reference) : null;
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      weightPercent: round1(weight),
      progressPercent: progress,
      currentDueDate: isoDay(item.dueDate) ?? "",
      baselineDueDate: baselineDue.get(item.id) ?? null,
      originalDueDate: originalDue.get(item.id) ?? null,
      completedAt: toDate(item.completedAt)?.toISOString() ?? null,
      slipDays,
      overdueDays
    };
  });

  const planned = milestones.length ? plannedPercent(effectiveBaseline, toDate(input.startDate), today) : 0;
  const spi = planned >= thresholds.minPlannedForSpi ? Math.round((actual / planned) * 100) / 100 : null;
  // Kỳ báo cáo đã có báo cáo nộp, đang được xét không bị tính là trễ (chậm xét là việc của chuyên viên).
  const handled = new Set((input.reports ?? []).filter((report) => report.checkpointId && ["submitted", "under_review", "accepted"].includes(report.status)).map((report) => report.checkpointId as string));
  const lateReports = (input.checkpoints ?? []).filter((item) => item.status !== "completed" && !handled.has(item.id) && toDate(item.dueDate) && calendarDayIndex(toDate(item.dueDate)!) < todayIndex).length;
  const endDate = toDate(input.endDate);
  const endDatePassed = !!endDate && calendarDayIndex(endDate) < todayIndex;
  const applicable = HEALTH_APPLICABLE_STATUSES.includes(input.status);

  const reasons: string[] = [];
  let level: HealthLevel | null = null;
  if (applicable) {
    const red: string[] = [];
    const amber: string[] = [];
    if (spi !== null && spi < thresholds.redSpi) red.push(`Chỉ số tiến độ ${spi.toFixed(2)} thấp hơn ${thresholds.redSpi}`);
    else if (spi !== null && spi < thresholds.amberSpi) amber.push(`Chỉ số tiến độ ${spi.toFixed(2)} thấp hơn ${thresholds.amberSpi}`);
    if (maxDaysOverdue > thresholds.redOverdueDays) red.push(`Có mốc trễ ${maxDaysOverdue} ngày`);
    else if (maxDaysOverdue > thresholds.amberOverdueDays) amber.push(`Có mốc trễ ${maxDaysOverdue} ngày`);
    if (lateReports >= thresholds.redLateReports) red.push(`${lateReports} kỳ báo cáo quá hạn`);
    else if (lateReports > 0) amber.push(`${lateReports} kỳ báo cáo quá hạn`);
    if (endDatePassed) red.push("Đã quá ngày kết thúc đề tài");
    level = red.length ? "red" : amber.length ? "amber" : "green";
    reasons.push(...red, ...amber);
    if (!milestones.length) reasons.push("Đề tài chưa có mốc; chỉ số tiến độ chưa có ý nghĩa");
  }

  return {
    asOf: today.toISOString(),
    applicable,
    weightsConfigured: configured,
    baselineVersion: baseline?.version ?? null,
    baselineMissing: !baseline,
    plannedPercent: round1(planned),
    actualPercent: round1(actual),
    spi,
    maxDaysOverdue,
    overdueMilestones,
    lateReports,
    endDatePassed,
    level,
    reasons,
    milestones: rows
  };
}

export type HealthAssessmentRecord = { id: string; level: string; computedLevel: string | null; reason: string; createdAt: Date | string; assessedBy?: { displayName?: string | null } | null };

/**
 * Mức chính thức: đánh giá gần nhất của chuyên viên nếu mức hệ thống lúc đánh giá vẫn bằng mức hệ thống hiện tại;
 * khi mức hệ thống đã đổi, đánh giá cũ hết hiệu lực (cần đánh giá lại).
 */
export function resolveEffectiveHealth(computed: HealthLevel | null, latest: HealthAssessmentRecord | null | undefined) {
  if (!computed) return { level: null, source: "not_applicable" as const, needsReassessment: false, assessment: null };
  if (!latest) return { level: computed, source: "computed" as const, needsReassessment: false, assessment: null };
  if (latest.computedLevel !== computed) return { level: computed, source: "computed" as const, needsReassessment: true, assessment: latest };
  return { level: latest.level as HealthLevel, source: "assessment" as const, needsReassessment: false, assessment: latest };
}
