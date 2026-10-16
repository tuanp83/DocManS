-- Số quyết định phê duyệt đề tài (văn thư cấp); trước đây không lưu nên văn bản luôn để trống.
ALTER TABLE "proposal_decisions" ADD COLUMN "decision_number" TEXT;

-- Hai quyết định không được trùng số (NULL = chưa có số, không bị ràng buộc).
CREATE UNIQUE INDEX "proposal_decisions_decision_number_key" ON "proposal_decisions"("decision_number");
