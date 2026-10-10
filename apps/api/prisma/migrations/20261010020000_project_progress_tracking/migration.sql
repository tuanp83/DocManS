-- Quản lý tiến độ nhiệm vụ, Đợt 1 (docs/design/quan-ly-tien-do-nhiem-vu.md, mục 3).

-- 1. Trọng số, phần trăm hoàn thành và mốc thời gian thực tế của từng mốc.
ALTER TABLE "project_milestones"
  ADD COLUMN "weight_percent" INTEGER,
  ADD COLUMN "progress_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "planned_start_date" DATE,
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "progress_updated_at" TIMESTAMP(3);

ALTER TABLE "project_milestones"
  ADD CONSTRAINT "project_milestones_weight_percent_check" CHECK ("weight_percent" IS NULL OR "weight_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "project_milestones_progress_percent_check" CHECK ("progress_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "project_milestones_planned_start_check" CHECK ("planned_start_date" IS NULL OR "planned_start_date" <= "due_date");

-- Mốc đã hoàn thành trước đây: coi như 100%, thời điểm hoàn thành = lần cập nhật cuối.
UPDATE "project_milestones"
   SET "progress_percent" = 100, "completed_at" = COALESCE("completed_at", "updated_at")
 WHERE "status" = 'completed';

-- 2. Phiên bản kế hoạch đã được phê duyệt.
CREATE TABLE "project_plan_baselines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "source_request_id" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "milestones" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_plan_baselines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_plan_baselines_project_id_version_key" ON "project_plan_baselines"("project_id", "version");
ALTER TABLE "project_plan_baselines" ADD CONSTRAINT "project_plan_baselines_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_plan_baselines" ADD CONSTRAINT "project_plan_baselines_source_request_id_fkey"
  FOREIGN KEY ("source_request_id") REFERENCES "project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_plan_baselines" ADD CONSTRAINT "project_plan_baselines_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_plan_baselines"
  ADD CONSTRAINT "project_plan_baselines_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "project_plan_baselines_source_check" CHECK ("source" IN ('setup', 'adjustment', 'extension', 'backfill')),
  ADD CONSTRAINT "project_plan_baselines_milestones_check" CHECK (jsonb_typeof("milestones") = 'array');

-- 3. Nhật ký cập nhật tiến độ mốc.
CREATE TABLE "project_milestone_progress_updates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "previous_percent" INTEGER NOT NULL,
    "progress_percent" INTEGER NOT NULL,
    "note" TEXT,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_milestone_progress_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_milestone_progress_updates_project_id_created_at_idx" ON "project_milestone_progress_updates"("project_id", "created_at");
ALTER TABLE "project_milestone_progress_updates" ADD CONSTRAINT "project_milestone_progress_updates_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone_progress_updates" ADD CONSTRAINT "project_milestone_progress_updates_milestone_id_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "project_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone_progress_updates" ADD CONSTRAINT "project_milestone_progress_updates_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone_progress_updates"
  ADD CONSTRAINT "project_milestone_progress_updates_percent_check"
  CHECK ("previous_percent" BETWEEN 0 AND 100 AND "progress_percent" BETWEEN 0 AND 100);

-- 4. Đánh giá sức khoẻ của chuyên viên phụ trách.
CREATE TABLE "project_health_assessments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "computed_level" TEXT,
    "reason" TEXT NOT NULL,
    "computed_facts" JSONB,
    "assessed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_health_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_health_assessments_project_id_created_at_idx" ON "project_health_assessments"("project_id", "created_at");
ALTER TABLE "project_health_assessments" ADD CONSTRAINT "project_health_assessments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_health_assessments" ADD CONSTRAINT "project_health_assessments_assessed_by_id_fkey"
  FOREIGN KEY ("assessed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_health_assessments"
  ADD CONSTRAINT "project_health_assessments_level_check" CHECK ("level" IN ('green', 'amber', 'red')),
  ADD CONSTRAINT "project_health_assessments_computed_level_check" CHECK ("computed_level" IS NULL OR "computed_level" IN ('green', 'amber', 'red')),
  ADD CONSTRAINT "project_health_assessments_reason_check" CHECK (length(btrim("reason")) > 0);

-- 5. Điền ngược kế hoạch gốc phiên bản 1 cho đề tài đã qua bước chuẩn bị, từ các mốc hiện có.
--    Đề tài còn ở bước chuẩn bị sẽ có kế hoạch gốc khi được xác nhận thiết lập.
INSERT INTO "project_plan_baselines" ("id", "project_id", "version", "source", "start_date", "end_date", "milestones", "created_by_id", "created_at")
SELECT gen_random_uuid()::text,
       p."id",
       1,
       'backfill',
       p."start_date",
       p."end_date",
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
                  'milestoneId', m."id",
                  'title', m."title",
                  'dueDate', to_char(m."due_date", 'YYYY-MM-DD'),
                  'weightPercent', m."weight_percent",
                  'plannedStartDate', CASE WHEN m."planned_start_date" IS NULL THEN NULL ELSE to_char(m."planned_start_date", 'YYYY-MM-DD') END
                ) ORDER BY m."due_date", m."position")
           FROM "project_milestones" m
          WHERE m."project_id" = p."id"
       ), '[]'::jsonb),
       COALESCE(p."confirmed_by_id", p."created_by_id"),
       COALESCE(p."confirmed_at", p."created_at")
  FROM "approved_projects" p
 WHERE p."status" <> 'preparing'
   AND NOT EXISTS (SELECT 1 FROM "project_plan_baselines" b WHERE b."project_id" = p."id");
