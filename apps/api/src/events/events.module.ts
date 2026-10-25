import { Global, Module } from "@nestjs/common";
import { EventsService } from "./events.service.js";

/** Global, because the chats, proxies and auth modules all record events. */
@Global()
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
