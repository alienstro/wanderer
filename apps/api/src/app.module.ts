import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ENV, type Env } from "./config/env.js";
import { HealthController } from "./health/health.controller.js";
import { ClientIpThrottlerGuard } from "./security/client-ip-throttler.guard.js";

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            // Logs never contain cookies or tokens.
            redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
          },
        }),
        // No global limit. A route sets its own limit with @Throttle().
        ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: Number.MAX_SAFE_INTEGER }]),
      ],
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
      ],
      exports: [ENV],
    };
  }
}
