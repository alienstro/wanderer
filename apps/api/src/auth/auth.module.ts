import { Module } from "@nestjs/common";
import { ENV, type Env } from "../config/env.js";
import { MeController } from "../me/me.controller.js";
import { MeService } from "../me/me.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GOOGLE_OIDC, OpenIdGoogleOidc } from "./google-oidc.js";
import { OptionalSessionGuard, SessionGuard } from "./session.guard.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    SessionService,
    SessionGuard,
    OptionalSessionGuard,
    AuthService,
    MeService,
    { provide: GOOGLE_OIDC, useFactory: (env: Env) => new OpenIdGoogleOidc(env), inject: [ENV] },
  ],
  exports: [SessionService, SessionGuard, OptionalSessionGuard],
})
export class AuthModule {}
