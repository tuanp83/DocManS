-- Nghiệm thu sản phẩm (tổ chuyên gia), nghiệm thu cấp trên cho đề tài cấp Bộ / Nhà nước.
-- Thiết kế: docs/design/nghiem-thu-thanh-ly-dong-de-tai.md, mục 1.0 và 1.4.

-- 1. Trạng thái mới của đề tài: đã nghiệm thu cơ sở, chờ cấp trên nghiệm thu.
ALTER TABLE "approved_projects" DROP CONSTRAINT IF EXISTS "approved_projects_status_check";
ALTER TABLE "approved_projects" ADD CONSTRAINT "approved_projects_status_check"
  CHECK ("status" IN ('preparing', 'executing', 'paused', 'pending_acceptance', 'pending_superior_acceptance', 'accepted', 'failed', 'closed'));

-- 2. Sản phẩm của đề tài: mỗi nội dung công việc trong thuyết minh là một sản phẩm (dạng 1–6).
CREATE TABLE "project_products" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "product_form" INTEGER NOT NULL,
    "requirements" TEXT,
    "milestone_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "submission" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_products_project_id_position_idx" ON "project_products"("project_id", "position");
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_milestone_id_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "project_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_products" ADD CONSTRAINT "project_products_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_products"
  ADD CONSTRAINT "project_products_form_check" CHECK ("product_form" BETWEEN 1 AND 6),
  ADD CONSTRAINT "project_products_status_check" CHECK ("status" IN ('PLANNED', 'SUBMITTED', 'UNDER_REVIEW', 'PASSED', 'FAILED')),
  ADD CONSTRAINT "project_products_submission_check" CHECK ("submission" IS NULL OR jsonb_typeof("submission") = 'object');

-- 3. Mỗi lần tổ chuyên gia nghiệm thu một sản phẩm.
CREATE TABLE "project_product_reviews" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PANEL_FORMED',
    "panel_members" JSONB NOT NULL,
    "review_date" DATE,
    "location" TEXT,
    "submission_snapshot" JSONB NOT NULL,
    "result" TEXT,
    "conclusion" TEXT,
    "minutes_file_ids" JSONB NOT NULL DEFAULT '[]',
    "formed_by_id" TEXT NOT NULL,
    "recorded_by_id" TEXT,
    "formed_at" TIMESTAMP(3) NOT NULL,
    "concluded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_product_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_product_reviews_product_id_round_key" ON "project_product_reviews"("product_id", "round");
CREATE INDEX "project_product_reviews_project_id_idx" ON "project_product_reviews"("project_id");
CREATE UNIQUE INDEX "project_product_reviews_one_open" ON "project_product_reviews"("product_id") WHERE "status" = 'PANEL_FORMED';
ALTER TABLE "project_product_reviews" ADD CONSTRAINT "project_product_reviews_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "project_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_product_reviews" ADD CONSTRAINT "project_product_reviews_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_product_reviews" ADD CONSTRAINT "project_product_reviews_formed_by_id_fkey"
  FOREIGN KEY ("formed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_product_reviews" ADD CONSTRAINT "project_product_reviews_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_product_reviews"
  ADD CONSTRAINT "project_product_reviews_status_check" CHECK ("status" IN ('PANEL_FORMED', 'CONCLUDED')),
  ADD CONSTRAINT "project_product_reviews_result_check" CHECK (("status" = 'CONCLUDED') = ("result" IS NOT NULL) AND ("result" IS NULL OR "result" IN ('PASSED', 'FAILED'))),
  -- Tổ chuyên gia 3–5 người.
  ADD CONSTRAINT "project_product_reviews_panel_check" CHECK (jsonb_typeof("panel_members") = 'array' AND jsonb_array_length("panel_members") BETWEEN 3 AND 5),
  ADD CONSTRAINT "project_product_reviews_minutes_check" CHECK (jsonb_typeof("minutes_file_ids") = 'array');

CREATE OR REPLACE FUNCTION protect_concluded_product_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CONCLUDED' THEN
    RAISE EXCEPTION 'concluded product review is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER project_product_reviews_concluded_immutable
  BEFORE UPDATE OR DELETE ON "project_product_reviews"
  FOR EACH ROW EXECUTE FUNCTION protect_concluded_product_review();

-- 4. Đề nghị cấp trên nghiệm thu (đề tài cấp Bộ / Nhà nước), hạn 30 ngày từ ngày nghiệm thu cơ sở xong.
CREATE TABLE "project_superior_acceptances" (
    "project_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "acceptance_id" TEXT NOT NULL,
    "facility_accepted_on" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "letter_number" TEXT,
    "letter_date" DATE,
    "recipient" TEXT,
    "letter_file_ids" JSONB NOT NULL DEFAULT '[]',
    "sent_at" TIMESTAMP(3),
    "sent_by_id" TEXT,
    "result" TEXT,
    "result_decision_number" TEXT,
    "result_date" DATE,
    "result_note" TEXT,
    "result_file_ids" JSONB NOT NULL DEFAULT '[]',
    "result_recorded_by_id" TEXT,
    "result_recorded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_superior_acceptances_pkey" PRIMARY KEY ("project_id")
);
ALTER TABLE "project_superior_acceptances" ADD CONSTRAINT "project_superior_acceptances_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "approved_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_superior_acceptances" ADD CONSTRAINT "project_superior_acceptances_acceptance_id_fkey"
  FOREIGN KEY ("acceptance_id") REFERENCES "project_acceptances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_superior_acceptances" ADD CONSTRAINT "project_superior_acceptances_sent_by_id_fkey"
  FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_superior_acceptances" ADD CONSTRAINT "project_superior_acceptances_result_recorded_by_id_fkey"
  FOREIGN KEY ("result_recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_superior_acceptances"
  ADD CONSTRAINT "project_superior_acceptances_level_check" CHECK ("level" IN ('ministry-level', 'national-level')),
  ADD CONSTRAINT "project_superior_acceptances_status_check" CHECK ("status" IN ('PREPARING', 'SENT', 'PASSED', 'FAILED')),
  ADD CONSTRAINT "project_superior_acceptances_due_check" CHECK ("due_date" = "facility_accepted_on" + 30),
  ADD CONSTRAINT "project_superior_acceptances_sent_check" CHECK ("status" = 'PREPARING' OR ("sent_at" IS NOT NULL AND "letter_number" IS NOT NULL AND "letter_date" IS NOT NULL)),
  ADD CONSTRAINT "project_superior_acceptances_result_check" CHECK (("status" IN ('PASSED', 'FAILED')) = ("result" IS NOT NULL)),
  ADD CONSTRAINT "project_superior_acceptances_json_check" CHECK (jsonb_typeof("checklist") = 'array' AND jsonb_typeof("letter_file_ids") = 'array' AND jsonb_typeof("result_file_ids") = 'array');

CREATE OR REPLACE FUNCTION protect_concluded_superior_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('PASSED', 'FAILED') THEN
    RAISE EXCEPTION 'concluded superior acceptance is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER project_superior_acceptances_concluded_immutable
  BEFORE UPDATE OR DELETE ON "project_superior_acceptances"
  FOR EACH ROW EXECUTE FUNCTION protect_concluded_superior_acceptance();

-- 5. Khoá thêm: minh chứng sản phẩm đã đưa ra tổ chuyên gia, biên bản tổ chuyên gia đã kết luận,
--    hồ sơ và công văn đã gửi cấp trên.
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
                WHERE l."project_id" = OLD.related_entity_id AND l."status" = 'APPROVED' AND l."evidence_file_ids" ? OLD.id)
     OR EXISTS (SELECT 1 FROM "project_products" pp
                WHERE pp."project_id" = OLD.related_entity_id AND pp."status" <> 'PLANNED' AND pp."status" <> 'FAILED'
                  AND COALESCE(pp."submission"->'evidenceFileIds', '[]'::jsonb) ? OLD.id)
     OR EXISTS (SELECT 1 FROM "project_product_reviews" r
                WHERE r."project_id" = OLD.related_entity_id
                  AND (COALESCE(r."submission_snapshot"->'evidenceFileIds', '[]'::jsonb) ? OLD.id
                       OR (r."status" = 'CONCLUDED' AND r."minutes_file_ids" ? OLD.id)))
     OR EXISTS (SELECT 1 FROM "project_superior_acceptances" s
                WHERE s."project_id" = OLD.related_entity_id AND s."status" <> 'PREPARING'
                  AND (s."letter_file_ids" ? OLD.id OR s."result_file_ids" ? OLD.id
                       OR EXISTS (SELECT 1 FROM jsonb_array_elements(s."checklist") item WHERE COALESCE(item->'fileIds', '[]'::jsonb) ? OLD.id))) THEN
    RAISE EXCEPTION 'submitted project evidence files are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
