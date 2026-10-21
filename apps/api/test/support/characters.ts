import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CharacterInput } from "@wanderer/shared";
import request from "supertest";
import { WEB_ORIGIN } from "./env.js";

/** The fields of a valid character. A test can replace single values. */
export function characterInput(overrides: Partial<CharacterInput> = {}): Partial<CharacterInput> {
  return {
    title: "Mira",
    bio: "A ship mechanic with a quiet laugh.",
    personality: "Calm, dry, and loyal.",
    scenario: "A cargo ship near Titan.",
    openings: ["The engine coughs again."],
    exampleDialogs: "{{user}}: Hi\n{{char}}: Hey.",
    tags: ["sci-fi"],
    publish: true,
    ...overrides,
  };
}

export function postCharacter(app: NestExpressApplication, cookie: string, body: Partial<CharacterInput>) {
  return request(app.getHttpServer()).post("/characters").set("Origin", WEB_ORIGIN).set("Cookie", cookie).send(body);
}

/** Makes a character through the API and gives its ID. */
export async function createCharacter(
  app: NestExpressApplication,
  cookie: string,
  overrides: Partial<CharacterInput> = {},
): Promise<string> {
  const res = await postCharacter(app, cookie, characterInput(overrides)).expect(201);
  return (res.body as { id: string }).id;
}
