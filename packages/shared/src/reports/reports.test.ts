import { describe, expect, it } from "vitest";
import { createReportRequestSchema, REPORT_NOTE_MAX, resolveReportRequestSchema } from "./reports.js";

describe("createReportRequestSchema", () => {
  it("trims the note and sets an empty note when the note is absent", () => {
    expect(createReportRequestSchema.parse({ reason: "hate", note: "  rude  " }).note).toBe("rude");
    expect(createReportRequestSchema.parse({ reason: "other" }).note).toBe("");
  });

  it("accepts a note of 500 characters and rejects 501", () => {
    expect(REPORT_NOTE_MAX).toBe(500);
    expect(createReportRequestSchema.safeParse({ reason: "copied", note: "a".repeat(500) }).success).toBe(true);
    expect(createReportRequestSchema.safeParse({ reason: "copied", note: "a".repeat(501) }).success).toBe(false);
  });

  it("rejects an unknown reason", () => {
    expect(createReportRequestSchema.safeParse({ reason: "spam" }).success).toBe(false);
  });
});

describe("resolveReportRequestSchema", () => {
  it("accepts the 4 actions and rejects another value", () => {
    for (const action of ["none", "hidden", "deleted", "banned"]) {
      expect(resolveReportRequestSchema.safeParse({ action }).success).toBe(true);
    }
    expect(resolveReportRequestSchema.safeParse({ action: "ban" }).success).toBe(false);
  });
});
