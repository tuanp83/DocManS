-- Nhà khoa học đồng ý hoặc từ chối lời mời phản biện trước khi được xem hồ sơ và chấm phiếu.
ALTER TABLE "proposal_review_assignments" ADD COLUMN "accepted_at" TIMESTAMP(3);
ALTER TABLE "proposal_review_assignments" ADD COLUMN "declined_at" TIMESTAMP(3);
ALTER TABLE "proposal_review_assignments" ADD COLUMN "decline_reason" TEXT;

-- Phân công có trước bước xác nhận được coi là đã nhận lời, để người đang chấm không bị chặn giữa chừng.
UPDATE "proposal_review_assignments"
SET "accepted_at" = "assigned_at"
WHERE "status" IN ('assigned', 'completed');
