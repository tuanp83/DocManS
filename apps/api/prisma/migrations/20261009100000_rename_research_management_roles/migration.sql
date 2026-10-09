-- Dành cho DB đã chạy bản cũ của migration 20261009000000_proposal_management_officers
-- (bản chưa đổi tên vai trò). Chạy lại an toàn: không có dòng nào khớp thì không đổi gì.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_system_role_check";

UPDATE "users" SET "system_role" = 'RESEARCH_MANAGEMENT_STAFF' WHERE "system_role" = 'SCIENTIFIC_MANAGEMENT_STAFF';
UPDATE "users" SET "system_role" = 'RESEARCH_MANAGEMENT_HEAD'  WHERE "system_role" = 'SCIENTIFIC_MANAGEMENT_HEAD';

ALTER TABLE "users" ADD CONSTRAINT "users_system_role_check"
  CHECK ("system_role" IS NULL OR "system_role" IN (
    'SYSTEM_ADMIN', 'RESEARCH_MANAGEMENT_HEAD', 'RESEARCH_MANAGEMENT_STAFF',
    'LEADERSHIP_APPROVAL_AUTHORITY', 'RESEARCH_OVERSIGHT_AUTHORITY',
    'RESEARCHER_INTERNAL_USER', 'EXTERNAL_RESEARCHER_USER'
  ));
