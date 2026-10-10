-- NCKH sinh viên: phạm vi đơn vị và ràng buộc dữ liệu.

ALTER TABLE "student_research_projects" ADD COLUMN "organization_unit_id" TEXT;
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_organization_unit_id_fkey"
  FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "student_research_projects_organization_unit_id_status_idx" ON "student_research_projects"("organization_unit_id", "status");

-- Điểm theo thang 10; ngày kết thúc không trước ngày bắt đầu; mã và tên không rỗng.
-- NOT VALID: áp dụng cho dữ liệu ghi từ nay; dữ liệu đã nhập trước (nếu lệch) không làm migration thất bại.
-- Sau khi rà soát dữ liệu cũ có thể chạy: ALTER TABLE student_research_projects VALIDATE CONSTRAINT <tên>;
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10)) NOT VALID;
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_dates_check" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date") NOT VALID;
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_code_check" CHECK (length(btrim("code")) > 0) NOT VALID;
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_name_check" CHECK (length(btrim("name")) > 0) NOT VALID;
