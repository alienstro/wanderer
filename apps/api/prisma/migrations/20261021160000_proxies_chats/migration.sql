-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_proxy_id" UUID,
ADD COLUMN     "reply_choices_on" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "proxies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "append_path" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT NOT NULL,
    "custom_prompt" TEXT NOT NULL DEFAULT '',
    "key_ciphertext" BYTEA NOT NULL,
    "key_iv" BYTEA NOT NULL,
    "key_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "key_last4" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proxies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proxies_user_id_idx" ON "proxies"("user_id");

-- CreateIndex
CREATE INDEX "chats_user_id_last_message_at_idx" ON "chats"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chats_user_id_character_id_idx" ON "chats"("user_id", "character_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_chat_id_position_key" ON "messages"("chat_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "users_active_proxy_id_key" ON "users"("active_proxy_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_proxy_id_fkey" FOREIGN KEY ("active_proxy_id") REFERENCES "proxies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxies" ADD CONSTRAINT "proxies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
