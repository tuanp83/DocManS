-- Phân cấp Phòng KHQS và Ban giám đốc: thêm Phó phòng KHQS, Trưởng ban QLKH, Phó Giám đốc phụ trách Khoa học.
-- Quản trị viên chuyển tài khoản Trưởng ban/Phó phòng/Phó GĐ KH sang vai trò mới sau khi triển khai.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_system_role_check";

ALTER TABLE "users" ADD CONSTRAINT "users_system_role_check"
  CHECK ("system_role" IS NULL OR "system_role" IN (
    'SYSTEM_ADMIN', 'RESEARCH_MANAGEMENT_HEAD', 'RESEARCH_MANAGEMENT_DEPUTY_HEAD', 'RESEARCH_BOARD_HEAD',
    'RESEARCH_MANAGEMENT_STAFF', 'LEADERSHIP_APPROVAL_AUTHORITY', 'SCIENCE_DEPUTY_DIRECTOR',
    'RESEARCH_OVERSIGHT_AUTHORITY', 'RESEARCHER_INTERNAL_USER', 'EXTERNAL_RESEARCHER_USER'
  ));
