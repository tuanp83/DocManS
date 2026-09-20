-- AlterTable
ALTER TABLE "research_proposals" ADD COLUMN "acceptance_council_metadata" JSONB,
ADD COLUMN "disbursement_metadata" JSONB,
ADD COLUMN "irb_metadata" JSONB;
