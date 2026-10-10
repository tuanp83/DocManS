-- CreateEnum
CREATE TYPE "StudentProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "student_research_projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentClass" TEXT NOT NULL,
    "studentContact" TEXT,
    "status" "StudentProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "supervisor_id" TEXT NOT NULL,
    "officer_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_research_documents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_research_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_research_projects_code_key" ON "student_research_projects"("code");

-- AddForeignKey
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_research_projects" ADD CONSTRAINT "student_research_projects_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_research_documents" ADD CONSTRAINT "student_research_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "student_research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_research_documents" ADD CONSTRAINT "student_research_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_research_documents" ADD CONSTRAINT "student_research_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

