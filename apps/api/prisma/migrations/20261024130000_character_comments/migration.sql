-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "comment_count" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('character', 'comment');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "comment_id" UUID,
ADD COLUMN     "target" "ReportTarget" NOT NULL DEFAULT 'character';

-- CreateTable
CREATE TABLE "character_comments" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "character_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_comments_character_id_created_at_id_idx" ON "character_comments"("character_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "character_comments_author_id_idx" ON "character_comments"("author_id");

-- One report for each character and reporter now applies only to a character report. The index reads
-- the target, not comment_id, because comment_id becomes NULL when the comment row goes.
-- DropIndex
DROP INDEX "reports_character_id_reporter_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "reports_character_id_reporter_id_key" ON "reports"("character_id", "reporter_id") WHERE (target = 'character');

-- CreateIndex
CREATE UNIQUE INDEX "reports_comment_id_reporter_id_key" ON "reports"("comment_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "character_comments" ADD CONSTRAINT "character_comments_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_comments" ADD CONSTRAINT "character_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "character_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
