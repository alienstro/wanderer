-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "opening_index" INTEGER NOT NULL DEFAULT 0;

-- An old chat gets the position of the opening whose text is the same as message 0. A chat with no match keeps 0.
UPDATE "chats" AS c
SET "opening_index" = o."position"
FROM "messages" AS m, "character_openings" AS o
WHERE m."chat_id" = c."id"
  AND m."position" = 0
  AND o."character_id" = c."character_id"
  AND o."text" = m."content";
