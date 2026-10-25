-- One global markup for all models. The text and image defaults become optional: null means the global markup.
ALTER TABLE "energy_settings" ADD COLUMN "global_markup_percent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "energy_settings" ALTER COLUMN "text_markup_percent" DROP NOT NULL,
ALTER COLUMN "text_markup_percent" DROP DEFAULT,
ALTER COLUMN "image_markup_percent" DROP NOT NULL,
ALTER COLUMN "image_markup_percent" DROP DEFAULT;

-- A group default of 0 was the start value, not an admin choice, so it now follows the global markup.
UPDATE "energy_settings" SET "text_markup_percent" = NULL WHERE "text_markup_percent" = 0;
UPDATE "energy_settings" SET "image_markup_percent" = NULL WHERE "image_markup_percent" = 0;

ALTER TABLE "energy_settings" DROP CONSTRAINT "energy_settings_values_check";
ALTER TABLE "energy_settings" ADD CONSTRAINT "energy_settings_values_check" CHECK (
    "id" = 1
    AND "daily_energy" >= 0
    AND "choices_price" >= 0
    AND "memory_price" >= 0
    AND "global_markup_percent" >= 0
    AND ("text_markup_percent" IS NULL OR "text_markup_percent" >= 0)
    AND ("image_markup_percent" IS NULL OR "image_markup_percent" >= 0)
    AND "free_daily_cap" >= 0
);
