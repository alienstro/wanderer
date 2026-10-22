import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ENV, type Env } from "../config/env.js";
import { FILE_STORAGE, LocalDiskStorage } from "./file-storage.js";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: FILE_STORAGE, useFactory: (env: Env) => new LocalDiskStorage(env.UPLOAD_DIR), inject: [ENV] },
  ],
  exports: [FilesService],
})
export class FilesModule {}
