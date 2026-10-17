-- Đơn vị chỉ bắt buộc với lời mời người trong Học viện chưa có tài khoản (đơn vị dùng để tạo tài khoản khi nhận lời).
-- Người đã có tài khoản giữ tài khoản của mình; tài khoản phạm vi toàn Học viện không có một đơn vị chính.
ALTER TABLE "conference_invitations" DROP CONSTRAINT "conference_invitations_internal_unit_check";
ALTER TABLE "conference_invitations" ADD CONSTRAINT "conference_invitations_internal_unit_check" CHECK (NOT "is_internal" OR "organization_unit_id" IS NOT NULL OR "user_id" IS NOT NULL);
