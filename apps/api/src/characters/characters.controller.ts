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
  UseGuards,
} from "@nestjs/common";
import { type CharacterDetail, type CharacterInput, characterInputSchema } from "@wanderer/shared";
import { CurrentUser, OptionalUser } from "../auth/current-user.decorator.js";
import { OptionalSessionGuard, SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { CharactersService } from "./characters.service.js";

/** Checks the form fields. A bad body gives 400 with the names of the bad fields. */
export function parseCharacterInput(body: unknown): CharacterInput {
  const parsed = characterInputSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_character", fields });
  }
  return parsed.data;
}

@Controller("characters")
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Post()
  @UseGuards(SessionGuard)
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<CharacterDetail> {
    return this.characters.create(user, parseCharacterInput(body));
  }

  @Get(":id")
  @UseGuards(OptionalSessionGuard)
  read(@OptionalUser() viewer: User | null, @Param("id") id: string): Promise<CharacterDetail> {
    return this.characters.findVisible(id, viewer);
  }

  @Patch(":id")
  @UseGuards(SessionGuard)
  update(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<CharacterDetail> {
    return this.characters.update(id, user, parseCharacterInput(body));
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.characters.remove(id, user);
  }
}
