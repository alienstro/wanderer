import { describe, expect, it } from "vitest";
import {
  COMMENT_MAX,
  COMMENT_REPORT_REASONS,
  commentListQuerySchema,
  createCommentReportRequestSchema,
  createCommentRequestSchema,
} from "./comments.js";

describe("createCommentRequestSchema", () => {
  it("trims the body", () => {
    expect(createCommentRequestSchema.parse({ body: "  Great scenario!  " }).body).toBe("Great scenario!");
  });

  it("accepts a body of 1,000 characters and rejects 1,001", () => {
    expect(COMMENT_MAX).toBe(1_000);
    expect(createCommentRequestSchema.safeParse({ body: "a".repeat(1_000) }).success).toBe(true);
    expect(createCommentRequestSchema.safeParse({ body: "a".repeat(1_001) }).success).toBe(false);
  });

  it("rejects an empty body and a body of only spaces", () => {
    expect(createCommentRequestSchema.safeParse({ body: "" }).success).toBe(false);
    expect(createCommentRequestSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("commentListQuerySchema", () => {
  it("accepts no cursor and a cursor, and rejects a cursor of more than 200 characters", () => {
    expect(commentListQuerySchema.parse({})).toEqual({});
    expect(commentListQuerySchema.parse({ cursor: "abc" })).toEqual({ cursor: "abc" });
    expect(commentListQuerySchema.safeParse({ cursor: "a".repeat(201) }).success).toBe(false);
  });
});

describe("createCommentReportRequestSchema", () => {
  it("accepts only the reasons that apply to a comment", () => {
    expect(COMMENT_REPORT_REASONS).toEqual(["minors", "sexual_content", "hate", "other"]);
    expect(createCommentReportRequestSchema.parse({ reason: "hate" })).toEqual({ reason: "hate", note: "" });
    expect(createCommentReportRequestSchema.safeParse({ reason: "copied" }).success).toBe(false);
    expect(createCommentReportRequestSchema.safeParse({ reason: "wrong_rating" }).success).toBe(false);
    expect(createCommentReportRequestSchema.parse({ reason: "sexual_content" }).reason).toBe("sexual_content");
  });
});
