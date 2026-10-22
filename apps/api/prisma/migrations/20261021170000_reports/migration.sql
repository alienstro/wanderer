-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('minors', 'wrong_rating', 'hate', 'copied', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('none', 'hidden', 'deleted', 'banned');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "character_id" UUID,
    "character_title" TEXT NOT NULL,
    "reporter_id" UUID,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "action" "ReportAction",
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_character_id_reporter_id_key" ON "reports"("character_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
