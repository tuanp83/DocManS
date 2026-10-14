-- Thành viên Hội đồng Đạo đức Y sinh (IRB): lời mời, nhận lời / từ chối, hiệu lực sau khi Ban giám đốc ký.
CREATE TABLE "proposal_irb_members" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "invited_by_id" TEXT NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "activated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "proposal_irb_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposal_irb_members_proposal_id_status_idx" ON "proposal_irb_members"("proposal_id", "status");
CREATE INDEX "proposal_irb_members_user_id_status_idx" ON "proposal_irb_members"("user_id", "status");

ALTER TABLE "proposal_irb_members" ADD CONSTRAINT "proposal_irb_members_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "research_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposal_irb_members" ADD CONSTRAINT "proposal_irb_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposal_irb_members" ADD CONSTRAINT "proposal_irb_members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hội đồng IRB đã được ký trước bản này (danh sách trong irb_metadata có tài khoản): coi là thành viên hiệu lực,
-- để họ vẫn nhận xét được. Hội đồng chưa ký giữ nguyên dạng cũ; chuyên viên gửi lời mời lại khi sửa tờ trình.
INSERT INTO "proposal_irb_members" ("id", "proposal_id", "user_id", "role", "status", "invited_by_id", "invited_at", "accepted_at", "activated_at", "updated_at")
SELECT gen_random_uuid()::text, p."id", m->>'userId', 'member', 'active',
       COALESCE(p."irb_metadata"->'council'->>'proposedById', p."owner_id"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "research_proposals" p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p."irb_metadata"->'council'->'members', '[]'::jsonb)) AS m
WHERE p."irb_metadata"->'council'->>'status' = 'approved'
  AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = m->>'userId')
  AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = COALESCE(p."irb_metadata"->'council'->>'proposedById', p."owner_id"));
