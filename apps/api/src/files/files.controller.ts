import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { AllowMultipart } from "../security/origin.guard.js";
import { FilesService } from "./files.service.js";
import { InvalidImageError, MAX_UPLOAD_BYTES } from "./image.js";

/** Reads one image upload in the field "file" into memory (no `dest`, so multer keeps it in memory). Multer stops a larger upload with 413. */
export const ImageUpload = () =>
  UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }),
  );

/** Changes a bad image into 400 { error: "invalid_image" }. */
export async function withImageCheck<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidImageError) {
      throw new BadRequestException({ error: "invalid_image" });
    }
    throw error;
  }
}

@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @AllowMultipart()
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ImageUpload()
  async upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ id: string; url: string }> {
    if (!file) {
      throw new BadRequestException({ error: "invalid_image" });
    }
    return withImageCheck(() => this.files.saveAvatar(user.id, file.buffer));
  }

  @Get(":id")
  async read(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const data = await this.files.read(id);
    if (!data) {
      throw new NotFoundException({ error: "not_found" });
    }
    res.set({
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.send(data);
  }
}
