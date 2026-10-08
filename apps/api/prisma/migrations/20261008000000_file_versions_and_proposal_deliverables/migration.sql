-- Backfills schema objects that commit 02d54bb added to schema.prisma without a migration:
--   * file_records.version          (file version history in FilesService.uploadFile)
--   * proposal_deliverables table   (ProposalDeliverable model)
-- Environments that already received these objects through `prisma db push` must apply this
-- migration without error, so every statement is idempotent. Definitions match the Prisma schema.

-- AlterTable
ALTER TABLE "file_records" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE IF NOT EXISTS "proposal_deliverables" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "proof_file_name" TEXT,
    "proof_storage_key" TEXT,
    "published_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proposal_deliverables_proposal_id_idx" ON "proposal_deliverables"("proposal_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proposal_deliverables_created_by_id_idx" ON "proposal_deliverables"("created_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proposal_deliverables_status_idx" ON "proposal_deliverables"("status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_deliverables_proposal_id_fkey') THEN
    ALTER TABLE "proposal_deliverables" ADD CONSTRAINT "proposal_deliverables_proposal_id_fkey"
      FOREIGN KEY ("proposal_id") REFERENCES "research_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_deliverables_created_by_id_fkey') THEN
    ALTER TABLE "proposal_deliverables" ADD CONSTRAINT "proposal_deliverables_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
