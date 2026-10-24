-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "character_likes" (
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_likes_pkey" PRIMARY KEY ("user_id","character_id")
);

-- CreateIndex
CREATE INDEX "character_likes_character_id_idx" ON "character_likes"("character_id");

-- CreateIndex
CREATE INDEX "characters_status_is_public_is_adult_like_count_created_at_idx" ON "characters"("status", "is_public", "is_adult", "like_count", "created_at");

-- AddForeignKey
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The trigger keeps like_count equal to the number of like rows. It also runs for the cascade
-- delete of a user, so the count of each character that the user liked goes down.
CREATE FUNCTION "character_likes_count"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "characters" SET "like_count" = "like_count" + 1 WHERE "id" = NEW."character_id";
        RETURN NEW;
    END IF;
    UPDATE "characters" SET "like_count" = "like_count" - 1 WHERE "id" = OLD."character_id";
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "character_likes_count"
AFTER INSERT OR DELETE ON "character_likes"
FOR EACH ROW EXECUTE FUNCTION "character_likes_count"();
