import { computeProjectProgress, resolveEffectiveHealth, type BaselineInput } from "./project-progress.js";

type AnyRecord = Record<string, any>;

/**
 * Tiến độ của một đề tài đã tải kèm mốc, kế hoạch gốc, kỳ báo cáo, báo cáo và đánh giá sức khoẻ.
 * Dùng chung cho chi tiết đề tài, danh sách theo dõi và ảnh chụp sức khoẻ hằng tuần để mọi nơi ra cùng một số.
 */
export function computeProgressForProject(project: AnyRecord, now = new Date()) {
  const baselines = (project.baselines ?? []) as AnyRecord[];
  const toBaseline = (row: AnyRecord | undefined): BaselineInput | null => row ? { version: row.version, startDate: row.startDate, endDate: row.endDate, milestones: Array.isArray(row.milestones) ? row.milestones : [] } : null;
  return computeProjectProgress({
    today: now,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    milestones: project.milestones ?? [],
    baseline: toBaseline(baselines[baselines.length - 1]),
    originalBaseline: toBaseline(baselines[0]),
    checkpoints: project.checkpoints ?? [],
    reports: project.reports ?? []
  });
}

/** Tóm tắt tiến độ + mức sức khoẻ hiệu lực (đánh giá của chuyên viên nếu còn khớp mức tính tự động). */
export function summarizeProjectProgress(project: AnyRecord, now = new Date()) {
  const progress = computeProgressForProject(project, now);
  const effective = resolveEffectiveHealth(progress.level, (project.healthAssessments ?? [])[0]);
  return {
    plannedPercent: progress.plannedPercent,
    actualPercent: progress.actualPercent,
    spi: progress.spi,
    maxDaysOverdue: progress.maxDaysOverdue,
    overdueMilestones: progress.overdueMilestones,
    lateReports: progress.lateReports,
    computedLevel: progress.level,
    level: effective.level,
    levelSource: effective.source,
    needsReassessment: effective.needsReassessment,
    reasons: progress.reasons
  };
}
