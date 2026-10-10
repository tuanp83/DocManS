-- Nghiệm thu, thanh lý, đóng đề tài; kinh phí/giải ngân gắn với đề tài; chống gửi trùng thông báo.
-- Thiết kế: docs/design/nghiem-thu-thanh-ly-dong-de-tai.md

-- 1. Đóng đề tài -------------------------------------------------------------------------------
ALTER TABLE "approved_projects"
  ADD COLUMN "closed_by_id" TEXT,
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "closure_note" TEXT;
ALTER TABLE "approved_projects" ADD CONSTRAINT "approved_projects_closed_by_id_fkey"
  FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Đề tài đã ở trạng thái "closed" từ trước (nếu có) lấy thời điểm cập nhật cuối làm ngày đóng.
UPDATE "approved_projects" SET "closed_at" = "updated_at" WHERE "status" = 'closed' AND "closed_at" IS NULL;
ALTER TABLE "approved_projects" ADD CONSTRAINT "approved_projects_closed_facts_check"
  CHECK (("status" = 'closed') = ("closed_at" IS NOT NULL));

-- 2. Vòng nghiệm thu ---------------------------------------------------------------------------
CREATE TABLE "project_acceptances" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "dossier" JSONB NOT NULL,
    "revision_dossier" JSONB,
    "return_reason" TEXT,
    "council_type" TEXT,
    "council_members" JSONB,
    "meeting_date" DATE,
    "meeting_location" TEXT,
    "tentative_agenda" TEXT,
    "decision_number" TEXT,
    "decision_date" DATE,
    "evaluation_result" JSONB,
    "resolution" TEXT,
    "minutes_notes" TEXT,
    "revision_note" TEXT,
    "legacy_source" JSONB,
    "submitted_by_id" TEXT NOT NULL,
    "established_by_id" TEXT,
    "minutes_recorded_by_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "council_proposed_at" TIMESTAMP(3),
    "established_at" TIMESTAMP(3),
    "evaluated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_acceptances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_acceptances_project_id_round_key" ON "project_acceptances"("project_id", "round");
CREATE UNIQUE INDEX "project_acceptances_decision_number_key" ON "project_acceptances"("decision_number");
-- Tối đa một vòng đang mở cho mỗi đề tài.
CREATE UNIQUE INDEX "project_acceptances_one_open_round" ON "project_acceptances"("project_id")
  WHERE "status" NOT IN ('RETURNED', 'PASSED', 'FAILED');
ALTER TABLE "project_acceptances" ADD CONSTRAINT "project_acceptances_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_acceptances" ADD CONSTRAINT "project_acceptances_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_acceptances" ADD CONSTRAINT "project_acceptances_established_by_id_fkey"
  FOREIGN KEY ("established_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_acceptances" ADD CONSTRAINT "project_acceptances_minutes_recorded_by_id_fkey"
  FOREIGN KEY ("minutes_recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_acceptances"
  ADD CONSTRAINT "project_acceptances_round_check" CHECK ("round" >= 1),
  ADD CONSTRAINT "project_acceptances_status_check" CHECK ("status" IN ('SUBMITTED', 'RETURNED', 'COUNCIL_PROPOSED', 'COUNCIL_ESTABLISHED', 'REVISION_REQUIRED', 'REVISION_SUBMITTED', 'PASSED', 'FAILED')),
  ADD CONSTRAINT "project_acceptances_council_type_check" CHECK ("council_type" IS NULL OR "council_type" IN ('FACILITY', 'OFFICIAL')),
  ADD CONSTRAINT "project_acceptances_resolution_check" CHECK ("resolution" IS NULL OR "resolution" IN ('approved', 'revise', 'rejected')),
  ADD CONSTRAINT "project_acceptances_dossier_check" CHECK (jsonb_typeof("dossier") = 'object');

-- 3. Kinh phí, đợt giải ngân, khoản chi --------------------------------------------------------
CREATE TABLE "project_finances" (
    "project_id" TEXT NOT NULL,
    "total_budget" BIGINT NOT NULL,
    "total_disbursed" BIGINT NOT NULL DEFAULT 0,
    "total_settled" BIGINT NOT NULL DEFAULT 0,
    "settlement_status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "legacy_source" JSONB,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_finances_pkey" PRIMARY KEY ("project_id")
);
ALTER TABLE "project_finances" ADD CONSTRAINT "project_finances_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_finances" ADD CONSTRAINT "project_finances_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_finances"
  ADD CONSTRAINT "project_finances_amounts_check" CHECK ("total_budget" >= 0 AND "total_disbursed" >= 0 AND "total_settled" >= 0),
  ADD CONSTRAINT "project_finances_settlement_status_check" CHECK ("settlement_status" IN ('PENDING', 'PARTIALLY_SETTLED', 'COMPLETED'));

CREATE TABLE "project_disbursements" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "tranche_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expected_amount" BIGINT NOT NULL,
    "disbursed_amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "disbursed_date" DATE,
    "settled_date" DATE,
    "evidence_notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "project_milestone_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_disbursements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_disbursements_project_id_tranche_key_key" ON "project_disbursements"("project_id", "tranche_key");
CREATE INDEX "project_disbursements_project_id_position_idx" ON "project_disbursements"("project_id", "position");
ALTER TABLE "project_disbursements" ADD CONSTRAINT "project_disbursements_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_disbursements" ADD CONSTRAINT "project_disbursements_project_milestone_id_fkey"
  FOREIGN KEY ("project_milestone_id") REFERENCES "project_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_disbursements"
  ADD CONSTRAINT "project_disbursements_amounts_check" CHECK ("expected_amount" >= 0 AND "disbursed_amount" >= 0 AND "disbursed_amount" <= "expected_amount"),
  ADD CONSTRAINT "project_disbursements_percentage_check" CHECK ("percentage" BETWEEN 0 AND 100),
  ADD CONSTRAINT "project_disbursements_status_check" CHECK ("status" IN ('PENDING', 'DISBURSED', 'SETTLED')),
  ADD CONSTRAINT "project_disbursements_attachments_check" CHECK (jsonb_typeof("attachments") = 'array');

CREATE TABLE "project_cost_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allocated_amount" BIGINT NOT NULL,
    "spent_amount" BIGINT NOT NULL DEFAULT 0,
    "settled_amount" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_cost_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_cost_items_project_id_code_key" ON "project_cost_items"("project_id", "code");
ALTER TABLE "project_cost_items" ADD CONSTRAINT "project_cost_items_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_cost_items"
  ADD CONSTRAINT "project_cost_items_amounts_check" CHECK ("allocated_amount" >= 0 AND "spent_amount" >= 0 AND "settled_amount" >= 0 AND "settled_amount" <= "spent_amount");

-- 4. Thanh lý ----------------------------------------------------------------------------------
CREATE TABLE "project_liquidations" (
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "outcome" TEXT NOT NULL,
    "liquidation_number" TEXT,
    "liquidation_date" DATE,
    "approved_budget" BIGINT NOT NULL,
    "total_disbursed" BIGINT NOT NULL,
    "total_settled" BIGINT NOT NULL,
    "recovered_amount" BIGINT NOT NULL DEFAULT 0,
    "products_handed_over" TEXT,
    "notes" TEXT,
    "evidence_file_ids" JSONB NOT NULL DEFAULT '[]',
    "prepared_by_id" TEXT NOT NULL,
    "prepared_at" TIMESTAMP(3) NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_liquidations_pkey" PRIMARY KEY ("project_id")
);
CREATE UNIQUE INDEX "project_liquidations_liquidation_number_key" ON "project_liquidations"("liquidation_number");
ALTER TABLE "project_liquidations" ADD CONSTRAINT "project_liquidations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_liquidations" ADD CONSTRAINT "project_liquidations_prepared_by_id_fkey"
  FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_liquidations" ADD CONSTRAINT "project_liquidations_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_liquidations"
  ADD CONSTRAINT "project_liquidations_status_check" CHECK ("status" IN ('DRAFT', 'APPROVED')),
  ADD CONSTRAINT "project_liquidations_outcome_check" CHECK ("outcome" IN ('accepted', 'failed')),
  ADD CONSTRAINT "project_liquidations_amounts_check" CHECK ("approved_budget" >= 0 AND "total_disbursed" >= 0 AND "total_settled" >= 0 AND "recovered_amount" >= 0),
  -- Tiền đã cấp phải được quyết toán hoặc thu hồi hết thì mới phê duyệt thanh lý.
  ADD CONSTRAINT "project_liquidations_balance_check" CHECK ("status" <> 'APPROVED' OR "total_settled" + "recovered_amount" = "total_disbursed"),
  ADD CONSTRAINT "project_liquidations_approved_facts_check" CHECK (("status" = 'APPROVED') = ("approved_at" IS NOT NULL AND "approved_by_id" IS NOT NULL)),
  ADD CONSTRAINT "project_liquidations_evidence_check" CHECK (jsonb_typeof("evidence_file_ids") = 'array');

-- Thanh lý đã phê duyệt là văn bản chính thức: không sửa, không xoá.
CREATE OR REPLACE FUNCTION protect_approved_project_liquidation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'approved project liquidation is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER project_liquidations_approved_immutable
  BEFORE UPDATE OR DELETE ON "project_liquidations"
  FOR EACH ROW EXECUTE FUNCTION protect_approved_project_liquidation();

-- Kết quả nghiệm thu đã kết luận (đạt/không đạt) không bị sửa hay xoá.
CREATE OR REPLACE FUNCTION protect_concluded_project_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('PASSED', 'FAILED', 'RETURNED') THEN
    RAISE EXCEPTION 'concluded project acceptance round is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER project_acceptances_concluded_immutable
  BEFORE UPDATE OR DELETE ON "project_acceptances"
  FOR EACH ROW EXECUTE FUNCTION protect_concluded_project_acceptance();

-- Tệp đã nộp trong hồ sơ nghiệm thu hoặc trong biên bản thanh lý đã duyệt cũng bị khoá như minh chứng báo cáo.
CREATE OR REPLACE FUNCTION protect_pinned_project_file() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "project_report_evidence" WHERE "file_record_id" = OLD.id)
     OR EXISTS (SELECT 1 FROM "project_request_evidence" WHERE "file_record_id" = OLD.id)
     OR EXISTS (SELECT 1 FROM "project_acceptances" a
                WHERE a."project_id" = OLD.related_entity_id
                  AND (COALESCE(a."dossier"->'evidenceFileIds', '[]'::jsonb) ? OLD.id
                       OR COALESCE(a."revision_dossier"->'evidenceFileIds', '[]'::jsonb) ? OLD.id
                       OR COALESCE(a."revision_dossier"->'allEvidenceFileIds', '[]'::jsonb) ? OLD.id))
     OR EXISTS (SELECT 1 FROM "project_liquidations" l
                WHERE l."project_id" = OLD.related_entity_id AND l."status" = 'APPROVED' AND l."evidence_file_ids" ? OLD.id) THEN
    RAISE EXCEPTION 'submitted project evidence files are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 5. Thông báo: khoá chống gửi trùng ----------------------------------------------------------
ALTER TABLE "user_notifications" ADD COLUMN "dedup_key" TEXT;
CREATE UNIQUE INDEX "user_notifications_user_id_dedup_key_key" ON "user_notifications"("user_id", "dedup_key");

-- 6. Chuyển dữ liệu cũ (JSON trên research_proposals) sang đề tài ------------------------------
-- Hàm dùng chung cho migration này và cho lúc tạo đề tài mới từ đề xuất đã có dữ liệu cũ. Chạy lại an toàn:
-- đề tài đã có kinh phí / vòng nghiệm thu thì bỏ qua phần tương ứng.
CREATE OR REPLACE FUNCTION project_legacy_amount(value TEXT) RETURNS BIGINT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value ~ '^\s*\d+(\.\d+)?\s*$' THEN LEAST(round(value::numeric), 10000000000000)::BIGINT ELSE 0 END
$$;
CREATE OR REPLACE FUNCTION project_legacy_date(value TEXT) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN left(value, 10)::DATE; END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION project_legacy_timestamp(value TEXT) RETURNS TIMESTAMP(3)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN value::TIMESTAMPTZ AT TIME ZONE 'UTC'; END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION import_legacy_project_closure(target_project_id TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
  md JSONB;
  ac JSONB;
  legacy_status TEXT;
  round_status TEXT;
  actor TEXT;
  next_project_status TEXT;
BEGIN
  SELECT ap.id, ap.status, ap.created_by_id, ap.proposal_id, r.budget_metadata, r.disbursement_metadata, r.acceptance_council_metadata
    INTO p
    FROM approved_projects ap JOIN research_proposals r ON r.id = ap.proposal_id
   WHERE ap.id = target_project_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- 6a. Kinh phí và giải ngân.
  md := p.disbursement_metadata;
  IF md IS NOT NULL AND jsonb_typeof(md) = 'object' AND NOT EXISTS (SELECT 1 FROM project_finances WHERE project_id = p.id) THEN
    INSERT INTO project_finances (project_id, total_budget, settlement_status, notes, version, legacy_source, updated_by_id, updated_at)
    VALUES (
      p.id,
      -- Ưu tiên số lãnh đạo phê duyệt, rồi số đề xuất; totalBudget cũ có thể là số mặc định giả nên chỉ dùng khi không có hai số kia.
      COALESCE(NULLIF(project_legacy_amount(p.budget_metadata->>'approvedAmount'), 0), NULLIF(project_legacy_amount(p.budget_metadata->>'amount'), 0), project_legacy_amount(md->>'totalBudget')),
      CASE WHEN md->>'settlementStatus' IN ('PENDING', 'PARTIALLY_SETTLED', 'COMPLETED') THEN md->>'settlementStatus' ELSE 'PENDING' END,
      left(COALESCE(md->>'notes', ''), 4000),
      0,
      jsonb_build_object('proposalId', p.proposal_id, 'importedFrom', 'research_proposals.disbursement_metadata', 'lastUpdatedAt', md->>'lastUpdatedAt'),
      (SELECT id FROM users WHERE id = md->>'lastUpdatedById'),
      CURRENT_TIMESTAMP
    );

    IF jsonb_typeof(md->'milestones') = 'array' THEN
      INSERT INTO project_disbursements (id, project_id, tranche_key, position, name, percentage, expected_amount, disbursed_amount, status, disbursed_date, settled_date, evidence_notes, attachments, updated_at)
      SELECT gen_random_uuid()::TEXT, p.id,
             left(COALESCE(NULLIF(m->>'id', ''), 'M' || ord), 64),
             (ord - 1)::INTEGER,
             left(COALESCE(NULLIF(m->>'name', ''), 'Đợt ' || ord), 300),
             CASE WHEN m->>'percentage' ~ '^\s*\d+(\.\d+)?\s*$' THEN LEAST((m->>'percentage')::DOUBLE PRECISION, 100) ELSE 0 END,
             GREATEST(project_legacy_amount(m->>'expectedAmount'), project_legacy_amount(m->>'disbursedAmount')),
             project_legacy_amount(m->>'disbursedAmount'),
             CASE WHEN m->>'status' IN ('PENDING', 'DISBURSED', 'SETTLED') THEN m->>'status' ELSE 'PENDING' END,
             project_legacy_date(m->>'disbursedDate'),
             project_legacy_date(m->>'settledDate'),
             NULLIF(left(COALESCE(m->>'evidenceNotes', ''), 2000), ''),
             CASE WHEN jsonb_typeof(m->'attachments') = 'array' THEN m->'attachments' ELSE '[]'::JSONB END,
             CURRENT_TIMESTAMP
        FROM jsonb_array_elements(md->'milestones') WITH ORDINALITY AS t(m, ord)
       WHERE jsonb_typeof(m) = 'object'
      ON CONFLICT (project_id, tranche_key) DO NOTHING;
    END IF;

    IF jsonb_typeof(md->'costItems') = 'array' THEN
      INSERT INTO project_cost_items (id, project_id, position, code, name, allocated_amount, spent_amount, settled_amount, updated_at)
      SELECT gen_random_uuid()::TEXT, p.id, (ord - 1)::INTEGER,
             left(COALESCE(NULLIF(c->>'code', ''), 'ITEM_' || ord), 64),
             left(COALESCE(NULLIF(c->>'name', ''), 'Khoản chi ' || ord), 300),
             project_legacy_amount(c->>'allocatedAmount'),
             GREATEST(project_legacy_amount(c->>'spentAmount'), project_legacy_amount(c->>'settledAmount')),
             project_legacy_amount(c->>'settledAmount'),
             CURRENT_TIMESTAMP
        FROM jsonb_array_elements(md->'costItems') WITH ORDINALITY AS t(c, ord)
       WHERE jsonb_typeof(c) = 'object'
      ON CONFLICT (project_id, code) DO NOTHING;
    END IF;

    UPDATE project_finances f
       SET total_disbursed = COALESCE((SELECT sum(disbursed_amount) FROM project_disbursements WHERE project_id = p.id), 0),
           total_settled = COALESCE((SELECT sum(settled_amount) FROM project_cost_items WHERE project_id = p.id), 0)
     WHERE f.project_id = p.id;

    -- Chứng từ giải ngân đã tải lên theo đề xuất chuyển sang đề tài.
    UPDATE file_records
       SET related_entity_type = 'approved_project', related_entity_id = p.id
     WHERE related_entity_type = 'research_proposal' AND related_entity_id = p.proposal_id AND file_purpose = 'disbursement_voucher';
  END IF;

  -- 6b. Hội đồng nghiệm thu.
  ac := p.acceptance_council_metadata;
  IF ac IS NOT NULL AND jsonb_typeof(ac) = 'object' AND NOT EXISTS (SELECT 1 FROM project_acceptances WHERE project_id = p.id) THEN
    legacy_status := CASE ac->>'status' WHEN 'proposed' THEN 'PROPOSED' WHEN 'approved' THEN 'ESTABLISHED' WHEN 'completed' THEN 'EVALUATED' ELSE ac->>'status' END;
    -- Kết quả cũ chỉ được tin khi có điểm và xếp loại hợp lệ: không đạt/từ chối → FAILED; đạt → PASSED
    -- (hoặc REVISION_REQUIRED nếu kết luận hoàn thiện); thiếu/không rõ → hội đồng đã thành lập, cần ghi lại biên bản.
    round_status := CASE
      WHEN legacy_status = 'PROPOSED' THEN 'COUNCIL_PROPOSED'
      WHEN legacy_status = 'ESTABLISHED' THEN 'COUNCIL_ESTABLISHED'
      WHEN legacy_status = 'EVALUATED' AND (ac->>'resolution' = 'rejected' OR ac->'evaluationResult'->>'classification' = 'FAILED') THEN 'FAILED'
      WHEN legacy_status = 'EVALUATED' AND ac->'evaluationResult'->>'classification' IN ('EXCELLENT', 'PASSED')
           AND (ac->'evaluationResult'->>'totalScore') ~ '^\s*\d+(\.\d+)?\s*$' AND (ac->'evaluationResult'->>'totalScore')::NUMERIC >= 70 THEN
        CASE WHEN ac->>'resolution' = 'revise' THEN 'REVISION_REQUIRED' ELSE 'PASSED' END
      WHEN legacy_status = 'EVALUATED' THEN 'COUNCIL_ESTABLISHED'
      ELSE NULL END;
    IF round_status IS NOT NULL THEN
      actor := COALESCE((SELECT id FROM users WHERE id = ac->>'proposedById'), p.created_by_id);
      INSERT INTO project_acceptances (
        id, project_id, round, status, dossier, council_type, council_members, meeting_date, meeting_location, tentative_agenda,
        decision_number, decision_date, evaluation_result, resolution, minutes_notes, legacy_source,
        submitted_by_id, established_by_id, minutes_recorded_by_id,
        submitted_at, council_proposed_at, established_at, evaluated_at, completed_at, updated_at)
      VALUES (
        gen_random_uuid()::TEXT, p.id, 1, round_status,
        jsonb_build_object('legacy', true, 'finalReportSummary', 'Ghi nhận từ dữ liệu hội đồng nghiệm thu cũ của đề xuất.', 'evidenceFileIds', '[]'::JSONB),
        CASE WHEN ac->>'councilType' IN ('FACILITY', 'OFFICIAL') THEN ac->>'councilType' ELSE 'OFFICIAL' END,
        CASE WHEN jsonb_typeof(ac->'members') = 'array' THEN ac->'members' ELSE '[]'::JSONB END,
        project_legacy_date(ac->>'meetingDate'),
        NULLIF(left(COALESCE(ac->>'meetingLocation', ''), 300), ''),
        NULLIF(left(COALESCE(ac->>'tentativeAgenda', ''), 2000), ''),
        NULLIF(ac->>'decisionNumber', ''),
        project_legacy_date(ac->>'decisionDate'),
        CASE WHEN round_status IN ('PASSED', 'FAILED', 'REVISION_REQUIRED') AND jsonb_typeof(ac->'evaluationResult') = 'object' THEN ac->'evaluationResult' ELSE NULL END,
        CASE WHEN round_status IN ('PASSED', 'FAILED', 'REVISION_REQUIRED') AND ac->>'resolution' IN ('approved', 'revise', 'rejected') THEN ac->>'resolution' ELSE NULL END,
        NULLIF(left(COALESCE(ac->>'minutesNotes', ''), 4000), ''),
        jsonb_build_object('proposalId', p.proposal_id, 'importedFrom', 'research_proposals.acceptance_council_metadata', 'status', ac->>'status', 'original', ac),
        actor,
        (SELECT id FROM users WHERE id = ac->>'approvedById'),
        (SELECT id FROM users WHERE id = ac->>'completedById'),
        COALESCE(project_legacy_timestamp(ac->>'proposedAt'), CURRENT_TIMESTAMP),
        project_legacy_timestamp(ac->>'proposedAt'),
        project_legacy_timestamp(ac->>'approvedAt'),
        CASE WHEN round_status IN ('PASSED', 'FAILED', 'REVISION_REQUIRED') THEN project_legacy_timestamp(ac->>'completedAt') ELSE NULL END,
        CASE WHEN round_status IN ('PASSED', 'FAILED') THEN COALESCE(project_legacy_timestamp(ac->>'completedAt'), CURRENT_TIMESTAMP) ELSE NULL END,
        CURRENT_TIMESTAMP
      );

      -- Trạng thái đề tài theo kết quả cũ, chỉ khi đề tài đang ở giai đoạn thực hiện/nghiệm thu.
      next_project_status := CASE round_status WHEN 'PASSED' THEN 'accepted' WHEN 'FAILED' THEN 'failed' ELSE 'pending_acceptance' END;
      IF p.status IN ('executing', 'paused', 'pending_acceptance') AND p.status <> next_project_status THEN
        UPDATE approved_projects
           SET status = next_project_status, aggregate_version = aggregate_version + 1, authorization_context_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = p.id;
        INSERT INTO project_history (id, project_id, actor_id, action, from_status, to_status, reason, before_facts, after_facts)
        VALUES (gen_random_uuid()::TEXT, p.id, actor, 'project.acceptance.backfill', p.status, next_project_status,
                'Ghi nhận kết quả hội đồng nghiệm thu từ dữ liệu cũ của đề xuất',
                jsonb_build_object('status', p.status), jsonb_build_object('status', next_project_status, 'acceptanceStatus', round_status));
      END IF;
    END IF;
  END IF;
END;
$$;

DO $$
DECLARE
  project_row RECORD;
  orphan_count INTEGER;
BEGIN
  FOR project_row IN SELECT id FROM approved_projects ORDER BY created_at LOOP
    PERFORM import_legacy_project_closure(project_row.id);
  END LOOP;
  SELECT count(*) INTO orphan_count FROM research_proposals r
   WHERE (r.disbursement_metadata IS NOT NULL OR r.acceptance_council_metadata IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM approved_projects ap WHERE ap.proposal_id = r.id);
  IF orphan_count > 0 THEN
    RAISE NOTICE '% đề xuất có dữ liệu giải ngân/nghiệm thu cũ nhưng chưa có đề tài; dữ liệu sẽ được chuyển khi tạo đề tài.', orphan_count;
  END IF;
END;
$$;
