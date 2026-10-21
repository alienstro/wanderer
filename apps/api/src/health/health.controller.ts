import { Controller, Get, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process answers. It does not call Postgres, so a database fault does not make Docker restart the API. */
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Readiness: the process answers and Postgres answers. A monitor uses it. The body never has the error. */
  @Get("ready")
  async ready(): Promise<{ status: "ok" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(`The readiness check failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
    return { status: "ok" };
  }
}
