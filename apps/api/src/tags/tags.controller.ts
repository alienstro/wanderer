import { Controller, Get } from "@nestjs/common";
import type { Tag, TagSlug } from "@wanderer/shared";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("tags")
export class TagsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Gives the tag list in label order. */
  @Get()
  async list(): Promise<Tag[]> {
    const tags = await this.prisma.tag.findMany({ orderBy: { label: "asc" } });
    return tags.map((tag) => ({ slug: tag.slug as TagSlug, label: tag.label }));
  }
}
