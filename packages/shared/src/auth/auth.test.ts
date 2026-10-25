import { describe, expect, it } from "vitest";
import { handleSchema, REPLY_CHOICES_PROMPT_MAX, suggestHandle, updateMeRequestSchema } from "./auth.js";

describe("handleSchema", () => {
  it('accepts "tian_01"', () => {
    expect(handleSchema.parse("tian_01")).toBe("tian_01");
  });

  it('changes " Tian " to "tian"', () => {
    expect(handleSchema.parse(" Tian ")).toBe("tian");
  });

  it('rejects "ti", a 21-character handle, "ti an", and "tian!"', () => {
    for (const bad of ["ti", "a".repeat(21), "ti an", "tian!"]) {
      expect(handleSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("suggestHandle", () => {
  it('returns "tian_lee" for "Tian.Lee+x@gmail.com"', () => {
    expect(suggestHandle("Tian.Lee+x@gmail.com")).toBe("tian_lee");
  });

  it('returns "ab_user" for "ab@x.io"', () => {
    expect(suggestHandle("ab@x.io")).toBe("ab_user");
  });
});

describe("updateMeRequestSchema", () => {
  it("trims replyChoicesPrompt and accepts 500 characters", () => {
    expect(updateMeRequestSchema.parse({ replyChoicesPrompt: "  Use *asterisks*.  " })).toEqual({
      replyChoicesPrompt: "Use *asterisks*.",
    });
    expect(updateMeRequestSchema.safeParse({ replyChoicesPrompt: "a".repeat(REPLY_CHOICES_PROMPT_MAX) }).success).toBe(true);
  });

  it("rejects a 501-character replyChoicesPrompt", () => {
    expect(updateMeRequestSchema.safeParse({ replyChoicesPrompt: "a".repeat(501) }).success).toBe(false);
  });
});
