import { describe, expect, it } from "vitest";
import { PERSONA_DESCRIPTION_MAX, PERSONA_LIMIT, PERSONA_NAME_MAX, personaInputSchema } from "./personas.js";

describe("personaInputSchema", () => {
  it("trims the name and the description", () => {
    expect(personaInputSchema.parse({ name: "  Aria  ", description: "  A knight.  " })).toEqual({
      name: "Aria",
      description: "A knight.",
    });
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(personaInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(personaInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 50 characters", () => {
    expect(PERSONA_NAME_MAX).toBe(50);
    expect(personaInputSchema.safeParse({ name: "x".repeat(50) }).success).toBe(true);
    expect(personaInputSchema.safeParse({ name: "x".repeat(51) }).success).toBe(false);
  });

  it("rejects a description over 1000 characters", () => {
    expect(PERSONA_DESCRIPTION_MAX).toBe(1000);
    expect(personaInputSchema.safeParse({ name: "Aria", description: "x".repeat(1000) }).success).toBe(true);
    expect(personaInputSchema.safeParse({ name: "Aria", description: "x".repeat(1001) }).success).toBe(false);
  });

  it('defaults the description to ""', () => {
    expect(personaInputSchema.parse({ name: "Aria" })).toEqual({ name: "Aria", description: "" });
  });
});

describe("PERSONA_LIMIT", () => {
  it("allows 3 personas", () => {
    expect(PERSONA_LIMIT).toBe(3);
  });
});
