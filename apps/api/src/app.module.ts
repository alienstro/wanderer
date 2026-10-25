import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CharactersModule } from "./characters/characters.module.js";
import { ChatsModule } from "./chats/chats.module.js";
import { CommentsModule } from "./comments/comments.module.js";
import { EventsModule } from "./events/events.module.js";
import { ApiKeysModule } from "./api-keys/api-keys.module.js";
import { ENV, type Env } from "./config/env.js";
import { serializeRequest } from "./config/logging.js";
import { FilesModule } from "./files/files.module.js";
import { HealthController } from "./health/health.controller.js";
import { MeModule } from "./me/me.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProxiesModule } from "./proxies/proxies.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { ScenesModule } from "./scenes/scenes.module.js";
import { ClientIpThrottlerGuard } from "./security/client-ip-throttler.guard.js";
import { OriginGuard } from "./security/origin.guard.js";
import { USER_THROTTLER } from "./security/user-throttler.guard.js";

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
            serializers: { req: serializeRequest },
          },
        }),
        // No global limit. A route sets its own limit with @Throttle().
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60_000, limit: Number.MAX_SAFE_INTEGER },
          { name: USER_THROTTLER, ttl: 60_000, limit: Number.MAX_SAFE_INTEGER },
        ]),
        PrismaModule,
        EventsModule,
        AuthModule,
        FilesModule,
        CharactersModule,
        AdminModule,
        MeModule,
        ApiKeysModule,
        ProxiesModule,
        ReportsModule,
        ChatsModule,
        ScenesModule,
        CommentsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
        { provide: APP_GUARD, useClass: OriginGuard },
      ],
      exports: [ENV],
    };
  }
}
