import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FilesModule } from "../files/files.module.js";
import { CharactersController } from "./characters.controller.js";
import { CharactersService } from "./characters.service.js";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [CharactersController],
  providers: [CharactersService],
  exports: [CharactersService],
})
export class CharactersModule {}
