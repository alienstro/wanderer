-- One avatar file belongs to one character.
CREATE UNIQUE INDEX "characters_avatar_file_id_key" ON "characters"("avatar_file_id");
