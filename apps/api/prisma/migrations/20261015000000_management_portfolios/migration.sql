-- Phân công chuyên viên QLKH theo mảng đề tài: cấp đề tài × tính chất (Quân sự / Dân sự).
ALTER TABLE "research_proposals" ADD COLUMN "military_scope" TEXT;

-- Hồ sơ cũ: điền theo cách giao diện vẫn suy ra trước đây (đề tài cấp Nhà nước ngoài lĩnh vực quân sự là
-- Dân sự, còn lại là Quân sự). Chủ nhiệm/chuyên viên sửa lại được trên hồ sơ.
UPDATE "research_proposals"
SET "military_scope" = CASE
  WHEN "proposal_type_code" = 'national-level' AND COALESCE("research_field_code", '') NOT LIKE '%military%' THEN 'civilian'
  ELSE 'military'
END;

CREATE TABLE "management_portfolios" (
    "id" TEXT NOT NULL,
    "officer_user_id" TEXT NOT NULL,
    "proposal_level" TEXT,
    "military_scope" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "management_portfolios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "management_portfolios_officer_user_id_idx" ON "management_portfolios"("officer_user_id");

ALTER TABLE "management_portfolios" ADD CONSTRAINT "management_portfolios_officer_user_id_fkey" FOREIGN KEY ("officer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "management_portfolios" ADD CONSTRAINT "management_portfolios_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
