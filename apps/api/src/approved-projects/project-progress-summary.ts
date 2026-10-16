import {
  computeProjectProgress,
  resolveEffectiveHealth,
  type BaselineInput,
  type BaselineMilestone,
  type HealthAssessmentRecord,
  type ProgressInput,
  type ProgressMilestoneInput
} from "./project-progress.js";

/** Kế hoạch gốc đã lưu; `milestones` là cột JSON nên chưa có kiểu cho tới khi kiểm tra là mảng. */
type StoredBaseline = { version: number; startDate?: Date | string | null; endDate?: Date | string | null; milestones: unknown };

/** Các trường của đề tài cần để tính tiến độ và mức sức khoẻ (đề tài tải kèm mốc, kế hoạch gốc, kỳ báo cáo, báo cáo, đánh giá). */
export type ProjectProgressSource = Pick<ProgressInput, "status" | "startDate" | "endDate"> & {
  milestones?: ProgressMilestoneInput[] | null;
  baselines?: StoredBaseline[] | null;
  checkpoints?: ProgressInput["checkpoints"] | null;
  reports?: ProgressInput["reports"] | null;
  healthAssessments?: HealthAssessmentRecord[] | null;
};

/**
 * Tiến độ của một đề tài đã tải kèm mốc, kế hoạch gốc, kỳ báo cáo, báo cáo và đánh giá sức khoẻ.
 * Dùng chung cho chi tiết đề tài, danh sách theo dõi và ảnh chụp sức khoẻ hằng tuần để mọi nơi ra cùng một số.
 */
export function computeProgressForProject(project: ProjectProgressSource, now = new Date()) {
  const baselines = project.baselines ?? [];
  const toBaseline = (row: StoredBaseline | undefined): BaselineInput | null =>
    row ? { version: row.version, startDate: row.startDate, endDate: row.endDate, milestones: Array.isArray(row.milestones) ? (row.milestones as BaselineMilestone[]) : [] } : null;
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
export function summarizeProjectProgress(project: ProjectProgressSource, now = new Date()) {
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
