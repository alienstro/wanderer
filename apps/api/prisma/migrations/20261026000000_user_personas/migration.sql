-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "persona_description" TEXT,
ADD COLUMN     "persona_name" TEXT;

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personas_user_id_idx" ON "personas"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "personas_one_default_key" ON "personas"("user_id") WHERE (is_default);

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
