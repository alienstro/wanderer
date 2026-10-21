-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('draft', 'published', 'hidden');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adult_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "show_adult" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "chat_name" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "scenario" TEXT NOT NULL DEFAULT '',
    "example_dialogs" TEXT NOT NULL DEFAULT '',
    "is_adult" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "definition_visible" BOOLEAN NOT NULL DEFAULT true,
    "status" "CharacterStatus" NOT NULL DEFAULT 'draft',
    "avatar_file_id" UUID,
    "chat_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_openings" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "character_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "character_tags" (
    "character_id" UUID NOT NULL,
    "tag_slug" TEXT NOT NULL,

    CONSTRAINT "character_tags_pkey" PRIMARY KEY ("character_id","tag_slug")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "characters_status_is_public_is_adult_chat_count_created_at_idx" ON "characters"("status", "is_public", "is_adult", "chat_count", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "characters_creator_id_title_key" ON "characters"("creator_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "character_openings_character_id_position_key" ON "character_openings"("character_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "tags_label_key" ON "tags"("label");

-- CreateIndex
CREATE INDEX "character_tags_tag_slug_idx" ON "character_tags"("tag_slug");

-- CreateIndex
CREATE INDEX "files_owner_id_idx" ON "files"("owner_id");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_openings" ADD CONSTRAINT "character_openings_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_tags" ADD CONSTRAINT "character_tags_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_tags" ADD CONSTRAINT "character_tags_tag_slug_fkey" FOREIGN KEY ("tag_slug") REFERENCES "tags"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The tag list from the prototype (spec section 13).
INSERT INTO "tags" ("slug", "label") VALUES
  ('adventure', 'Adventure'),
  ('fantasy', 'Fantasy'),
  ('horror', 'Horror'),
  ('military', 'Military'),
  ('mystery', 'Mystery'),
  ('noir', 'Noir'),
  ('post-apoc', 'PostApoc'),
  ('school', 'School'),
  ('sci-fi', 'SciFi'),
  ('slice-of-life', 'SliceOfLife');
