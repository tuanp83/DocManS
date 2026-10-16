import type { Prisma } from "@prisma/client";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { summarizeProjectProgress } from "../approved-projects/project-progress-summary.js";
import { HEALTH_APPLICABLE_STATUSES, localDayIndex } from "../approved-projects/project-progress.js";

type AnyRecord = Record<string, any>;

const DAY = 86_400_000;
const BATCH = 200;

/** Ngày chụp: ngày lịch ở Việt Nam của thời điểm chạy, lưu dạng 00:00Z (cột DATE). */
export function snapshotDateOf(now: Date) {
  return new Date(localDayIndex(now) * DAY);
}

const clampPercent = (value: unknown) => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, number));
};

const nonNegativeBigInt = (value: unknown): bigint | null => {
  if (value === null || value === undefined) return null;
  try {
    const number = typeof value === "bigint" ? value : BigInt(value as any);
    return number < 0n ? 0n : number;
  } catch {
    return null;
  }
};

/** Một dòng ảnh chụp từ đề tài đã tải kèm mốc, kế hoạch gốc, kỳ báo cáo, báo cáo, đánh giá sức khoẻ, kinh phí. */
export function snapshotRow(project: SnapshotProject, snapshotDate: Date, now: Date) {
  const summary = summarizeProjectProgress(project, now);
  const scope = (project.scopeSnapshot ?? {}) as AnyRecord;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null);
  // Mốc / kỳ báo cáo không được đóng khi nghiệm thu: chỉ tính trễ cho đề tài còn thực hiện, tạm dừng.
  const tracked = HEALTH_APPLICABLE_STATUSES.includes(project.status);
  return {
    snapshotDate,
    projectId: project.id as string,
    hostOrganizationUnitId: project.hostOrganizationUnitId as string,
    status: project.status as string,
    level: text(scope.proposalTypeCode),
    researchFieldCode: text(scope.researchFieldCode),
    healthLevel: summary.level,
    computedLevel: summary.computedLevel,
    healthSource: summary.levelSource,
    plannedPercent: clampPercent(summary.plannedPercent),
    actualPercent: clampPercent(summary.actualPercent),
    spi: typeof summary.spi === "number" && Number.isFinite(summary.spi) && summary.spi >= 0 ? summary.spi : null,
    maxDaysOverdue: tracked ? Math.max(0, summary.maxDaysOverdue | 0) : 0,
    overdueMilestones: tracked ? Math.max(0, summary.overdueMilestones | 0) : 0,
    lateReports: tracked ? Math.max(0, summary.lateReports | 0) : 0,
    totalBudget: nonNegativeBigInt(project.finance?.totalBudget),
    totalDisbursed: nonNegativeBigInt(project.finance?.totalDisbursed),
    totalSettled: nonNegativeBigInt(project.finance?.totalSettled)
  };
}

const SNAPSHOT_INCLUDE = {
  milestones: { orderBy: [{ dueDate: "asc" }, { position: "asc" }] },
  checkpoints: { orderBy: { dueDate: "asc" } },
  reports: { select: { checkpointId: true, status: true } },
  baselines: { orderBy: { version: "asc" } },
  healthAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
  finance: true
} satisfies Prisma.ApprovedProjectInclude;

/** Đề tài tải kèm mốc, kế hoạch gốc, kỳ báo cáo, báo cáo, đánh giá sức khoẻ gần nhất và kinh phí để chụp sức khoẻ. */
type SnapshotProject = Prisma.ApprovedProjectGetPayload<{ include: typeof SNAPSHOT_INCLUDE }>;

/**
 * Chụp sức khoẻ mọi đề tài mỗi tối Chủ nhật (23:55 giờ Việt Nam) để vẽ xu hướng theo tuần; tác vụ chạy 23:55
 * hằng ngày nhưng chỉ ghi khi đến hạn (isDue).
 * Idempotent: mỗi đề tài một dòng mỗi ngày chụp (unique project_id + snapshot_date); chạy lại, chạy song song
 * trên nhiều bản API hay chạy bù sau sự cố chỉ thêm các dòng còn thiếu. Tắt bằng HEALTH_SNAPSHOTS_ENABLED=false.
 */
@Injectable()
export class ProjectHealthSnapshotService {
  private readonly logger = new Logger(ProjectHealthSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("55 23 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async handleCron() {
    if (process.env.HEALTH_SNAPSHOTS_ENABLED === "false") return;
    try {
      const now = new Date();
      if (!(await this.isDue(now))) return;
      const created = await this.run(now);
      this.logger.log(`Ảnh chụp sức khoẻ đề tài: đã ghi ${created} dòng.`);
    } catch (error) {
      this.logger.error(`Ảnh chụp sức khoẻ đề tài thất bại: ${(error as Error)?.message ?? error}`);
    }
  }

  /**
   * Chụp vào tối Chủ nhật; ngày khác chỉ chụp bù khi lần chụp gần nhất đã cũ hơn 7 ngày (máy chủ tắt đúng tối
   * Chủ nhật, lần triển khai đầu tiên) để chuỗi xu hướng không bị hụt tuần.
   */
  async isDue(now: Date) {
    const today = localDayIndex(now);
    if (new Date(today * DAY).getUTCDay() === 0) return true;
    const latest = await this.prisma.projectHealthSnapshot.findFirst({ orderBy: { snapshotDate: "desc" }, select: { snapshotDate: true } });
    if (!latest) return true;
    const latestIndex = Math.floor(new Date(latest.snapshotDate).getTime() / DAY);
    return today - latestIndex >= 7;
  }

  /** Trả về số dòng mới ghi. */
  async run(now: Date): Promise<number> {
    const prisma = this.prisma as any;
    const snapshotDate = snapshotDateOf(now);
    let created = 0;
    let cursor: string | null = null;
    for (;;) {
      const projects: SnapshotProject[] = await prisma.approvedProject.findMany({
        include: SNAPSHOT_INCLUDE,
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      if (!projects.length) break;
      const existing = new Set<string>((await prisma.projectHealthSnapshot.findMany({
        where: { snapshotDate, projectId: { in: projects.map((project) => project.id) } },
        select: { projectId: true }
      })).map((row: AnyRecord) => row.projectId));
      const rows = projects.filter((project) => !existing.has(project.id)).map((project) => snapshotRow(project, snapshotDate, now));
      if (rows.length) created += (await prisma.projectHealthSnapshot.createMany({ data: rows, skipDuplicates: true })).count;
      if (projects.length < BATCH) break;
      cursor = projects[projects.length - 1].id;
    }
    return created;
  }
}
