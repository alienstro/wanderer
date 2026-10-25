-- CreateEnum
CREATE TYPE "AppEventType" AS ENUM ('login', 'ai_reply_failed', 'choices_failed', 'summary_failed', 'proxy_test_failed', 'model_list_failed');

-- CreateTable
CREATE TABLE "app_events" (
    "id" UUID NOT NULL,
    "type" "AppEventType" NOT NULL,
    "user_id" UUID,
    "character_id" UUID,
    "reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_events_type_created_at_idx" ON "app_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "app_events_created_at_idx" ON "app_events"("created_at");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- AddForeignKey
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

