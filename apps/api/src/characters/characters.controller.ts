import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type CharacterCard,
  type CharacterDetail,
  type CharacterInput,
  type CharacterListResponse,
  type MyCharacterCard,
  characterListQuerySchema,
} from "@wanderer/shared";
import { CurrentUser, OptionalUser } from "../auth/current-user.decorator.js";
import { OptionalSessionGuard, SessionGuard } from "../auth/session.guard.js";
import { ImageUpload, withImageCheck } from "../files/files.controller.js";
import { FilesService } from "../files/files.service.js";
import type { User } from "../generated/prisma/client.js";
import { AllowMultipart } from "../security/origin.guard.js";
import { parseCharacterInput } from "./character-input.js";
import { CharacterListService } from "./character-list.service.js";
import { CharactersService } from "./characters.service.js";
import { readTavernCard } from "./tavern-card.js";

@Controller("characters")
export class CharactersController {
  constructor(
    private readonly characters: CharactersService,
    private readonly lists: CharacterListService,
    private readonly files: FilesService,
  ) {}

  @Get()
  @UseGuards(OptionalSessionGuard)
  list(@OptionalUser() viewer: User | null, @Query() query: unknown): Promise<CharacterListResponse> {
    const parsed = characterListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_query" });
    }
    return this.lists.discover(parsed.data, viewer);
  }

  /** This route comes before ":id", so "for-you" is not read as a character ID. */
  @Get("for-you")
  @UseGuards(SessionGuard)
  forYou(@CurrentUser() user: User): Promise<{ items: CharacterCard[] }> {
    return this.lists.forYou(user);
  }

  @Post()
  @UseGuards(SessionGuard)
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<CharacterDetail> {
    return this.characters.create(user, parseCharacterInput(body));
  }

  /** Reads a Tavern PNG into a form draft and stores the image as the avatar. It creates no character. */
  @Post("import-png")
  @HttpCode(200)
  @AllowMultipart()
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ImageUpload()
  async importPng(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ draft: Partial<CharacterInput>; avatarFileId: string }> {
    const draft = file ? readTavernCard(file.buffer) : null;
    if (!file || !draft) {
      throw new BadRequestException({ error: "no_character_card" });
    }
    const avatar = await withImageCheck(() => this.files.saveAvatar(user.id, file.buffer));
    return { draft, avatarFileId: avatar.id };
  }

  @Get(":id")
  @UseGuards(OptionalSessionGuard)
  read(@OptionalUser() viewer: User | null, @Param("id") id: string): Promise<CharacterDetail> {
    return this.characters.findVisible(id, viewer);
  }

  @Patch(":id")
  @UseGuards(SessionGuard)
  update(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<CharacterDetail> {
    return this.characters.update(id, user, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.characters.remove(id, user);
  }
}

@Controller("me/characters")
@UseGuards(SessionGuard)
export class MyCharactersController {
  constructor(private readonly lists: CharacterListService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<MyCharacterCard[]> {
    return this.lists.mine(user);
  }
}
