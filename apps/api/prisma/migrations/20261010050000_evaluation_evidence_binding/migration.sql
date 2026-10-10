-- Gắn vòng đánh giá với đúng lần nộp hồ sơ, khoá phiên bản gói đánh giá khi lãnh đạo quyết định
-- (mang từ thanhdotien278/DocManS, migration 20260921010000_proposal_review_golden_flow, điều chỉnh cho dữ liệu của nhánh này).

ALTER TABLE "proposal_review_assignments" ADD COLUMN "reviewed_submission_event_id" TEXT;

ALTER TABLE "proposal_reviews"
  ADD COLUMN "submission_event_id" TEXT,
  ADD COLUMN "context_version" JSONB,
  ADD COLUMN "evidence_snapshot" JSONB;

ALTER TABLE "proposal_evaluation_summaries"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "context_version" JSONB,
  ADD COLUMN "evidence_snapshot" JSONB;

ALTER TABLE "proposal_decisions"
  ADD COLUMN "package_revision" INTEGER,
  ADD COLUMN "context_version" JSONB,
  ADD COLUMN "package_snapshot" JSONB;

-- 1. Kết quả kiểm tra đầy đủ cũ: bảng sự kiện là chỉ-ghi-thêm (trigger preserve_proposal_submission_events), nên
--    ghi THÊM một bản kiểm tra gắn với lần nộp gần nhất trước thời điểm kiểm tra (giữ nguyên thời điểm, lưu id bản gốc).
INSERT INTO "proposal_submission_events" ("id", "proposal_id", "actor_id", "from_status", "to_status", "submitted_at", "note", "snapshot")
SELECT gen_random_uuid()::text,
       check_event.proposal_id,
       check_event.actor_id,
       check_event.from_status,
       check_event.to_status,
       check_event.submitted_at,
       check_event.note,
       check_event.snapshot || jsonb_build_object('submissionEventId', sub.id, 'backfilledFrom', check_event.id)
FROM "proposal_submission_events" check_event
JOIN LATERAL (
  SELECT s.id
  FROM "proposal_submission_events" s
  WHERE s.proposal_id = check_event.proposal_id
    AND s.to_status IN ('submitted', 'resubmitted')
    AND s.snapshot ? 'members' AND NOT (s.snapshot ? 'kind')
    AND s.submitted_at <= check_event.submitted_at
  ORDER BY s.submitted_at DESC
  LIMIT 1
) sub ON TRUE
WHERE check_event.snapshot ->> 'kind' = 'completeness_check'
  AND NOT (check_event.snapshot ? 'submissionEventId');

-- 1b. Hồ sơ đã vào bước đánh giá theo quy định cũ mà không có kết quả kiểm tra đầy đủ cho lần nộp hiện tại
--     (ví dụ mở vòng qua duyệt hội đồng): ghi thêm một bản kiểm tra "legacyBackfill" để vòng đánh giá đang chạy
--     không bị kẹt. Người ghi: người phân công đầu tiên, nếu không có thì chủ nhiệm hồ sơ.
INSERT INTO "proposal_submission_events" ("id", "proposal_id", "actor_id", "from_status", "to_status", "submitted_at", "note", "snapshot")
SELECT gen_random_uuid()::text,
       p.id,
       COALESCE((SELECT a.assigned_by_id FROM "proposal_review_assignments" a WHERE a.proposal_id = p.id ORDER BY a.assigned_at ASC LIMIT 1), p.owner_id),
       p.status,
       p.status,
       cur.submitted_at,
       'Ghi nhận kiểm tra đầy đủ cho hồ sơ đã vào bước đánh giá trước khi áp dụng gắn lần nộp',
       jsonb_build_object('kind', 'completeness_check', 'submissionEventId', cur.id, 'readiness', jsonb_build_object('ready', true), 'legacyBackfill', true, 'backfilledFrom', 'legacy')
FROM "research_proposals" p
JOIN LATERAL (
  SELECT s.id, s.submitted_at
  FROM "proposal_submission_events" s
  WHERE s.proposal_id = p.id
    AND s.to_status IN ('submitted', 'resubmitted')
    AND s.snapshot ? 'members' AND NOT (s.snapshot ? 'kind')
    AND (p.submitted_at IS NULL OR s.submitted_at >= p.submitted_at)
  ORDER BY s.submitted_at DESC
  LIMIT 1
) cur ON TRUE
WHERE p.status IN ('under_review', 'ready_for_approval')
  AND NOT EXISTS (
    SELECT 1 FROM "proposal_submission_events" c
    WHERE c.proposal_id = p.id
      AND c.snapshot ->> 'kind' = 'completeness_check'
      AND c.snapshot ->> 'submissionEventId' = cur.id
  );

-- 1c. Cảnh báo (không chặn): hồ sơ đang đánh giá không có bản chụp lần nộp dùng được (nộp trước khi có bản chụp).
--     Các hồ sơ này cần chuyên viên xử lý thủ công (yêu cầu bổ sung để PI nộp lại).
DO $$
DECLARE stuck integer;
BEGIN
  SELECT count(*) INTO stuck FROM "research_proposals" p
  WHERE p.status IN ('submitted', 'resubmitted', 'under_review', 'ready_for_approval')
    AND NOT EXISTS (
      SELECT 1 FROM "proposal_submission_events" s
      WHERE s.proposal_id = p.id AND s.to_status IN ('submitted', 'resubmitted')
        AND s.snapshot ? 'members' AND NOT (s.snapshot ? 'kind')
        AND (p.submitted_at IS NULL OR s.submitted_at >= p.submitted_at)
    );
  IF stuck > 0 THEN
    RAISE NOTICE 'evaluation_evidence_binding: % hồ sơ đang xử lý không có bản chụp lần nộp; cần yêu cầu bổ sung để nộp lại.', stuck;
  END IF;
END $$;

-- 2. Phân công cũ: gắn với lần nộp gần nhất trước thời điểm phân công.
UPDATE "proposal_review_assignments" assignment
SET reviewed_submission_event_id = (
  SELECT s.id
  FROM "proposal_submission_events" s
  WHERE s.proposal_id = assignment.proposal_id
    AND s.to_status IN ('submitted', 'resubmitted')
    AND s.snapshot ? 'members' AND NOT (s.snapshot ? 'kind')
    AND s.submitted_at <= assignment.assigned_at
  ORDER BY s.submitted_at DESC
  LIMIT 1
)
WHERE assignment.reviewed_submission_event_id IS NULL;

-- 3. Phiếu cũ: theo phân công của phiếu.
UPDATE "proposal_reviews" review
SET submission_event_id = assignment.reviewed_submission_event_id
FROM "proposal_review_assignments" assignment
WHERE review.assignment_id = assignment.id
  AND review.submission_event_id IS NULL;

-- 4. Bản tổng hợp đã trình lãnh đạo: tạo bằng chứng gói (đã chốt, phiên bản 1) để quyết định vẫn thực hiện được.
UPDATE "proposal_evaluation_summaries" summary
SET revision = 1,
    evidence_snapshot = jsonb_build_object(
      'kind', 'evaluation_package',
      'schemaVersion', 'proposal-evaluation-package.v1',
      'lifecycle', 'finalized',
      'revision', 1,
      'submissionEventId', round.event_id,
      'assignmentIds', round.assignment_ids,
      'reviewIds', round.review_ids,
      'summary', summary.summary,
      'recommendation', summary.recommendation,
      'backfilled', true
    )
FROM (
  SELECT a.proposal_id,
         a.reviewed_submission_event_id AS event_id,
         jsonb_agg(a.id) AS assignment_ids,
         COALESCE(jsonb_agg(r.id) FILTER (WHERE r.status = 'submitted'), '[]'::jsonb) AS review_ids
  FROM "proposal_review_assignments" a
  LEFT JOIN "proposal_reviews" r ON r.assignment_id = a.id
  WHERE a.reviewed_submission_event_id IS NOT NULL AND a.status <> 'revoked'
  GROUP BY a.proposal_id, a.reviewed_submission_event_id
) round
WHERE summary.proposal_id = round.proposal_id
  AND summary.status = 'ready_for_approval'
  AND summary.evidence_snapshot IS NULL
  AND round.event_id = (
    SELECT s.id FROM "proposal_submission_events" s
    WHERE s.proposal_id = summary.proposal_id AND s.to_status IN ('submitted', 'resubmitted')
      AND s.snapshot ? 'members' AND NOT (s.snapshot ? 'kind')
    ORDER BY s.submitted_at DESC LIMIT 1
  );

CREATE INDEX "proposal_review_assignments_reviewed_submission_event_id_idx" ON "proposal_review_assignments"("reviewed_submission_event_id");
CREATE INDEX "proposal_reviews_submission_event_id_idx" ON "proposal_reviews"("submission_event_id");

-- 5. Phiếu đã gửi là bằng chứng, không phải bản nháp: ứng dụng đã chặn sửa, trigger giữ bất biến cho cả SQL trực tiếp.
CREATE OR REPLACE FUNCTION protect_submitted_proposal_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'submitted' THEN
      RAISE EXCEPTION 'submitted proposal reviews are immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'submitted' AND (
    NEW.proposal_id IS DISTINCT FROM OLD.proposal_id OR
    NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR
    NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id OR
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.score_data IS DISTINCT FROM OLD.score_data OR
    NEW.total_score IS DISTINCT FROM OLD.total_score OR
    NEW.comment IS DISTINCT FROM OLD.comment OR
    NEW.recommendation IS DISTINCT FROM OLD.recommendation OR
    NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR
    NEW.submission_event_id IS DISTINCT FROM OLD.submission_event_id OR
    NEW.context_version IS DISTINCT FROM OLD.context_version OR
    NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot
  ) THEN
    RAISE EXCEPTION 'submitted proposal reviews are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_reviews_submitted_immutable ON "proposal_reviews";
CREATE TRIGGER proposal_reviews_submitted_immutable
  BEFORE UPDATE ON "proposal_reviews"
  FOR EACH ROW EXECUTE FUNCTION protect_submitted_proposal_review();

DROP TRIGGER IF EXISTS proposal_reviews_submitted_immutable_delete ON "proposal_reviews";
CREATE TRIGGER proposal_reviews_submitted_immutable_delete
  BEFORE DELETE ON "proposal_reviews"
  FOR EACH ROW EXECUTE FUNCTION protect_submitted_proposal_review();
