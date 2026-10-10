-- NCKH sinh viên: giảng viên đăng ký (chưa có mã, chưa có chuyên viên), người tạo, lịch sử thao tác.

ALTER TABLE "student_research_projects" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "student_research_projects" ALTER COLUMN "officer_id" DROP NOT NULL;

ALTER TABLE "student_research_projects" ADD COLUMN "created_by_id" TEXT;
UPDATE "student_research_projects" SET "created_by_id" = "officer_id" WHERE "created_by_id" IS NULL;
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "student_research_projects_supervisor_id_idx" ON "student_research_projects"("supervisor_id");

-- Đề tài đang thực hiện hoặc đã hoàn thành phải có mã và chuyên viên quản lý.
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_active_has_code_check"
  CHECK ("status" NOT IN ('ACTIVE', 'COMPLETED') OR ("code" IS NOT NULL AND "officer_id" IS NOT NULL)) NOT VALID;

CREATE TABLE "student_research_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "reason" TEXT,
    "facts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_research_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_research_events_project_id_created_at_idx" ON "student_research_events"("project_id", "created_at");
ALTER TABLE "student_research_events" ADD CONSTRAINT "student_research_events_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "student_research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_research_events" ADD CONSTRAINT "student_research_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
