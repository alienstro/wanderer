import { describe, expect, it } from "vitest";
import { handleSchema, suggestHandle } from "./auth.js";

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
