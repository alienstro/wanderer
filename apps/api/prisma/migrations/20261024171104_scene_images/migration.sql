-- CreateTable
CREATE TABLE "scene_images" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chat_id" UUID,
    "file_id" UUID,
    "after_position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scene_images_file_id_key" ON "scene_images"("file_id");

-- CreateIndex
CREATE INDEX "scene_images_chat_id_created_at_idx" ON "scene_images"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_images_user_id_created_at_idx" ON "scene_images"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "scene_images" ADD CONSTRAINT "scene_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_images" ADD CONSTRAINT "scene_images_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_images" ADD CONSTRAINT "scene_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
