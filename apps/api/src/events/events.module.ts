import { Module } from "@nestjs/common";
import { EventsService } from "./events.service.js";

/** Listens to the app events that the other modules send, and saves them for the admin overview. */
@Module({
  providers: [EventsService],
})
export class EventsModule {}
