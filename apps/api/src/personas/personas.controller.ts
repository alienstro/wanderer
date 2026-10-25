import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { type Persona, type PersonaInput, type PersonaListResponse, personaInputSchema } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { PersonasService } from "./personas.service.js";

function parseInput(body: unknown): PersonaInput {
  const parsed = personaInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new BadRequestException({ error: "invalid_persona" });
  }
  return parsed.data;
}

/** Reads the request, checks a body with the shared zod schema, and calls the service. No business rules here. */
@Controller("personas")
@UseGuards(SessionGuard)
export class PersonasController {
  constructor(private readonly service: PersonasService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<PersonaListResponse> {
    return this.service.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<Persona> {
    return this.service.create(user, parseInput(body));
  }

  @Patch(":id")
  update(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<Persona> {
    return this.service.update(user, id, parseInput(body));
  }

  @Post(":id/default")
  @HttpCode(200)
  makeDefault(@CurrentUser() user: User, @Param("id") id: string): Promise<PersonaListResponse> {
    return this.service.makeDefault(user, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.service.remove(user, id);
  }
}
