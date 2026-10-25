-- CreateEnum
CREATE TYPE "EnergyReason" AS ENUM ('reply', 'choices', 'memory', 'scene', 'refund', 'refill');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppEventType" ADD VALUE 'energy_too_low';
ALTER TYPE "AppEventType" ADD VALUE 'free_model_busy';
ALTER TYPE "AppEventType" ADD VALUE 'admin_change';

-- AlterTable
ALTER TABLE "app_events" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "energy" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "energy_refilled_at" TIMESTAMP(3),
ADD COLUMN     "free_model_id" UUID;

-- CreateTable
CREATE TABLE "energy_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "EnergyReason" NOT NULL,
    "chat_id" UUID,
    "free_model_id" UUID,
    "refund_of_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_models" (
    "id" UUID NOT NULL,
    "openrouter_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "prompt_price_usd" DECIMAL(20,12),
    "completion_price_usd" DECIMAL(20,12),
    "prices_fetched_at" TIMESTAMP(3),
    "markup_percent" INTEGER,
    "manual_energy_price" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scene_models" (
    "key" TEXT NOT NULL,
    "cost_usd" DECIMAL(12,6) NOT NULL,
    "markup_percent" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "scene_models_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "energy_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "daily_energy" INTEGER NOT NULL DEFAULT 2000,
    "choices_price" INTEGER NOT NULL DEFAULT 0,
    "memory_price" INTEGER NOT NULL DEFAULT 100,
    "scene_model_key" TEXT NOT NULL DEFAULT 'flux-schnell',
    "text_markup_percent" INTEGER NOT NULL DEFAULT 0,
    "image_markup_percent" INTEGER NOT NULL DEFAULT 0,
    "free_daily_cap" INTEGER NOT NULL DEFAULT 950,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "energy_entries_refund_of_id_key" ON "energy_entries"("refund_of_id");

-- CreateIndex
CREATE INDEX "energy_entries_user_id_created_at_idx" ON "energy_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "energy_entries_reason_created_at_idx" ON "energy_entries"("reason", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "free_models_openrouter_id_key" ON "free_models"("openrouter_id");

-- CreateIndex
CREATE UNIQUE INDEX "free_models_one_default_key" ON "free_models"("is_default") WHERE (is_default);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_free_model_id_fkey" FOREIGN KEY ("free_model_id") REFERENCES "free_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_entries" ADD CONSTRAINT "energy_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_entries" ADD CONSTRAINT "energy_entries_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_entries" ADD CONSTRAINT "energy_entries_free_model_id_fkey" FOREIGN KEY ("free_model_id") REFERENCES "free_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_entries" ADD CONSTRAINT "energy_entries_refund_of_id_fkey" FOREIGN KEY ("refund_of_id") REFERENCES "energy_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_settings" ADD CONSTRAINT "energy_settings_scene_model_key_fkey" FOREIGN KEY ("scene_model_key") REFERENCES "scene_models"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_settings" ADD CONSTRAINT "energy_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The balance never goes below 0. The spend is a conditional update, and this check is the last guard.
ALTER TABLE "users" ADD CONSTRAINT "users_energy_check" CHECK ("energy" >= 0);

ALTER TABLE "free_models" ADD CONSTRAINT "free_models_values_check" CHECK (
    ("markup_percent" IS NULL OR "markup_percent" >= 0)
    AND ("manual_energy_price" IS NULL OR "manual_energy_price" >= 0)
    AND ("prompt_price_usd" IS NULL OR "prompt_price_usd" >= 0)
    AND ("completion_price_usd" IS NULL OR "completion_price_usd" >= 0)
);

ALTER TABLE "scene_models" ADD CONSTRAINT "scene_models_values_check" CHECK (
    "cost_usd" >= 0 AND ("markup_percent" IS NULL OR "markup_percent" >= 0)
);

-- The settings table has exactly one row.
ALTER TABLE "energy_settings" ADD CONSTRAINT "energy_settings_values_check" CHECK (
    "id" = 1
    AND "daily_energy" >= 0
    AND "choices_price" >= 0
    AND "memory_price" >= 0
    AND "text_markup_percent" >= 0
    AND "image_markup_percent" >= 0
    AND "free_daily_cap" >= 0
);

-- The RunPod costs of one image: Flux Schnell from the RunPod bill, Z-Image Turbo from the RunPod docs.
INSERT INTO "scene_models" ("key", "cost_usd") VALUES ('flux-schnell', 0.003), ('z-image-turbo', 0.005);

INSERT INTO "energy_settings" ("id") VALUES (1);
