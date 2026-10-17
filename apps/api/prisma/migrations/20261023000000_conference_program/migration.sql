-- AlterTable
ALTER TABLE "scientific_conferences" ADD COLUMN     "default_slot_minutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "program_changed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "conference_sessions" (
    "id" TEXT NOT NULL,
    "conference_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "chair_name" TEXT,
    "secretary_name" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "slot_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conference_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_session_breaks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conference_session_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_session_slots" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "manually_adjusted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "conference_session_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_program_versions" (
    "id" TEXT NOT NULL,
    "conference_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conference_program_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_proceedings" (
    "id" TEXT NOT NULL,
    "conference_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_id" TEXT NOT NULL,
    "isbn" TEXT,
    "note" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conference_proceedings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conference_sessions_conference_id_starts_at_idx" ON "conference_sessions"("conference_id", "starts_at");

-- CreateIndex
CREATE INDEX "conference_session_breaks_session_id_idx" ON "conference_session_breaks"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "conference_session_slots_paper_id_key" ON "conference_session_slots"("paper_id");

-- CreateIndex
CREATE INDEX "conference_session_slots_session_id_position_idx" ON "conference_session_slots"("session_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "conference_program_versions_conference_id_version_number_key" ON "conference_program_versions"("conference_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "conference_proceedings_conference_id_version_number_key" ON "conference_proceedings"("conference_id", "version_number");

-- AddForeignKey
ALTER TABLE "conference_sessions" ADD CONSTRAINT "conference_sessions_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "scientific_conferences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_session_breaks" ADD CONSTRAINT "conference_session_breaks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conference_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_session_slots" ADD CONSTRAINT "conference_session_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conference_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_session_slots" ADD CONSTRAINT "conference_session_slots_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "conference_papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_program_versions" ADD CONSTRAINT "conference_program_versions_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "scientific_conferences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_program_versions" ADD CONSTRAINT "conference_program_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_proceedings" ADD CONSTRAINT "conference_proceedings_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "scientific_conferences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_proceedings" ADD CONSTRAINT "conference_proceedings_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_proceedings" ADD CONSTRAINT "conference_proceedings_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conference_sessions" ADD CONSTRAINT "conference_sessions_kind_check" CHECK ("kind" IN ('plenary', 'track'));
ALTER TABLE "conference_sessions" ADD CONSTRAINT "conference_sessions_time_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "conference_sessions" ADD CONSTRAINT "conference_sessions_slot_minutes_check" CHECK ("slot_minutes" IS NULL OR "slot_minutes" BETWEEN 1 AND 240);
ALTER TABLE "conference_session_breaks" ADD CONSTRAINT "conference_session_breaks_time_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "scientific_conferences" ADD CONSTRAINT "scientific_conferences_slot_minutes_check" CHECK ("default_slot_minutes" BETWEEN 1 AND 240);
