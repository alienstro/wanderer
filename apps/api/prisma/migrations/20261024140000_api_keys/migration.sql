-- Saved API keys (issue #34). Each proxy key moves to "api_keys" with the same ID.
-- The moved keys keep version 1, whose AAD is "proxy:<id>", so they decrypt with no new encrypt.
-- Prisma does not wrap a migration in a transaction, so this file does. A failure changes nothing.
BEGIN;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_ciphertext" BYTEA NOT NULL,
    "key_iv" BYTEA NOT NULL,
    "key_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "key_last4" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- Move each proxy key. The key gets the name of its proxy.
INSERT INTO "api_keys" ("id", "user_id", "name", "key_ciphertext", "key_iv", "key_tag", "key_version", "key_last4", "created_at", "updated_at")
SELECT "id", "user_id", "name", "key_ciphertext", "key_iv", "key_tag", "key_version", "key_last4", "created_at", "updated_at"
FROM "proxies";

-- Point each proxy to its moved key.
ALTER TABLE "proxies" ADD COLUMN "api_key_id" UUID;
UPDATE "proxies" SET "api_key_id" = "id";
ALTER TABLE "proxies" ALTER COLUMN "api_key_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "proxies" DROP COLUMN "key_ciphertext",
DROP COLUMN "key_iv",
DROP COLUMN "key_last4",
DROP COLUMN "key_tag",
DROP COLUMN "key_version";

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "proxies_api_key_id_idx" ON "proxies"("api_key_id");

-- AddForeignKey
ALTER TABLE "proxies" ADD CONSTRAINT "proxies_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
