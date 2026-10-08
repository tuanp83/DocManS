-- Council / IRB document numbers (nhật ký Bước 9–10).

-- Per-scope, per-year counters. Numbers restart at 001 each year and are taken inside the
-- caller's transaction, so a rolled-back write never burns or duplicates a number.
CREATE TABLE "document_number_counters" (
    "scope" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_number_counters_pkey" PRIMARY KEY ("scope","year")
);

-- Backstop: no two proposals may hold the same IRB certificate number.
CREATE UNIQUE INDEX "research_proposals_irb_certificate_number_key"
  ON "research_proposals" (("irb_metadata" -> 'certificate' ->> 'certificateNumber'))
  WHERE ("irb_metadata" -> 'certificate' ->> 'certificateNumber') IS NOT NULL;

-- Backstop: no two proposals may hold the same acceptance-council establishment decision number.
CREATE UNIQUE INDEX "research_proposals_acceptance_decision_number_key"
  ON "research_proposals" (("acceptance_council_metadata" ->> 'decisionNumber'))
  WHERE ("acceptance_council_metadata" ->> 'decisionNumber') IS NOT NULL;
