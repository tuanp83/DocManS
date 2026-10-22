-- Báo cáo kết quả công tác KHQS theo kỳ (H1 = 6 tháng đầu năm, FY = cả năm): văn bản báo cáo, các biểu nhập tay
-- (KQ-3, KQ-4, KQ-6) và phần sửa kết quả / ghi chú của KQ-1, KQ-2. Mỗi kỳ một bản; version chống ghi đè lẫn nhau.
CREATE TABLE "khqs_periodic_reports" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "period" TEXT NOT NULL,
  "narrative" JSONB NOT NULL DEFAULT '{}',
  "manual_tables" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "khqs_periodic_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "khqs_periodic_reports_period_check" CHECK ("period" IN ('H1', 'FY') AND "year" BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX "khqs_periodic_reports_year_period_key" ON "khqs_periodic_reports"("year", "period");
ALTER TABLE "khqs_periodic_reports" ADD CONSTRAINT "khqs_periodic_reports_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Truy vấn theo kỳ của báo cáo: đề tài theo ngày bắt đầu, giải ngân theo ngày cấp.
CREATE INDEX "approved_projects_start_date_idx" ON "approved_projects"("start_date");
CREATE INDEX "project_disbursements_project_id_disbursed_date_idx" ON "project_disbursements"("project_id", "disbursed_date");
