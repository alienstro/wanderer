import { Controller, Get, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** A Postgres that does not answer in this time counts as down. The monitor then gets a fast 503. */
const READY_TIMEOUT_MS = 2000;

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
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${READY_TIMEOUT_MS} ms`)), READY_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
    } catch (error) {
      this.logger.warn(`The readiness check failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException({ status: "unavailable" });
    } finally {
      clearTimeout(timer);
    }
    return { status: "ok" };
  }
}
