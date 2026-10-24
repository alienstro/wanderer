import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FilesModule } from "../files/files.module.js";
import { TagsController } from "../tags/tags.controller.js";
import { CharacterLikesService } from "./character-likes.service.js";
import { CharacterListService } from "./character-list.service.js";
import { CharactersController, MyCharactersController } from "./characters.controller.js";
import { CharactersService } from "./characters.service.js";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [CharactersController, MyCharactersController, TagsController],
  providers: [CharactersService, CharacterListService, CharacterLikesService],
  exports: [CharactersService],
})
export class CharactersModule {}
