import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ENV, type Env } from "../config/env.js";
import { ApiKeysController } from "./api-keys.controller.js";
import { ApiKeysService } from "./api-keys.service.js";
import { KEY_CIPHER, KeyCipher } from "./key-cipher.js";

@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    { provide: KEY_CIPHER, useFactory: (env: Env) => new KeyCipher(env.KEY_ENCRYPTION_KEY), inject: [ENV] },
  ],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
