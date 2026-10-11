-- Ảnh chụp sức khoẻ đề tài hằng tuần cho dashboard xu hướng.
-- Thiết kế: docs/design/dashboard-thong-ke-dot-1.md, mục 2.

CREATE TABLE "project_health_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "project_id" TEXT NOT NULL,
    "host_organization_unit_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "level" TEXT,
    "research_field_code" TEXT,
    "health_level" TEXT,
    "computed_level" TEXT,
    "health_source" TEXT NOT NULL,
    "planned_percent" DOUBLE PRECISION NOT NULL,
    "actual_percent" DOUBLE PRECISION NOT NULL,
    "spi" DOUBLE PRECISION,
    "max_days_overdue" INTEGER NOT NULL DEFAULT 0,
    "overdue_milestones" INTEGER NOT NULL DEFAULT 0,
    "late_reports" INTEGER NOT NULL DEFAULT 0,
    "total_budget" BIGINT,
    "total_disbursed" BIGINT,
    "total_settled" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_health_snapshots_project_id_snapshot_date_key" ON "project_health_snapshots"("project_id", "snapshot_date");
CREATE INDEX "project_health_snapshots_snapshot_date_idx" ON "project_health_snapshots"("snapshot_date");

ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_host_organization_unit_id_fkey"
  FOREIGN KEY ("host_organization_unit_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Không ràng buộc danh sách trạng thái đề tài ở đây: thêm trạng thái mới cho approved_projects không được làm
-- hỏng tác vụ chụp (approved_projects đã có ràng buộc riêng).
ALTER TABLE "project_health_snapshots"
  ADD CONSTRAINT "project_health_snapshots_health_check"
    CHECK ("health_level" IS NULL OR "health_level" IN ('green', 'amber', 'red')),
  ADD CONSTRAINT "project_health_snapshots_computed_check"
    CHECK ("computed_level" IS NULL OR "computed_level" IN ('green', 'amber', 'red')),
  ADD CONSTRAINT "project_health_snapshots_source_check"
    CHECK ("health_source" IN ('computed', 'assessment', 'not_applicable')),
  ADD CONSTRAINT "project_health_snapshots_percent_check"
    CHECK ("planned_percent" BETWEEN 0 AND 100 AND "actual_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "project_health_snapshots_spi_check" CHECK ("spi" IS NULL OR "spi" >= 0),
  ADD CONSTRAINT "project_health_snapshots_counts_check"
    CHECK ("max_days_overdue" >= 0 AND "overdue_milestones" >= 0 AND "late_reports" >= 0),
  ADD CONSTRAINT "project_health_snapshots_money_check"
    CHECK (("total_budget" IS NULL OR "total_budget" >= 0) AND ("total_disbursed" IS NULL OR "total_disbursed" >= 0) AND ("total_settled" IS NULL OR "total_settled" >= 0));

-- Ảnh chụp là số liệu lịch sử: chỉ ghi thêm. Sửa một dòng đã chụp sẽ làm sai biểu đồ xu hướng.
CREATE OR REPLACE FUNCTION protect_project_health_snapshot() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'project_health_snapshots is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_health_snapshots_immutable
  BEFORE UPDATE ON "project_health_snapshots"
  FOR EACH ROW EXECUTE FUNCTION protect_project_health_snapshot();
