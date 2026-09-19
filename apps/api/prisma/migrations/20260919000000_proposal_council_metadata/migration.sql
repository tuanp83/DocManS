-- AlterTable
ALTER TABLE "research_proposals" ADD COLUMN IF NOT EXISTS "council_metadata" JSONB;
