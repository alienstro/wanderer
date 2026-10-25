import { z } from "zod";
import { REPORT_NOTE_MAX } from "../reports/index.js";

/** The longest comment. The body is plain text. */
export const COMMENT_MAX = 1_000;
/** The number of comments on one page of the list. */
export const COMMENTS_PAGE_SIZE = 20;

export const createCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_MAX),
});

export const commentListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
});

/** The report reasons that apply to a comment. They are a subset of the character report reasons. */
export const COMMENT_REPORT_REASONS = ["minors", "hate", "other"] as const;

export const createCommentReportRequestSchema = z.object({
  reason: z.enum(COMMENT_REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX).default(""),
});

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
export type CreateCommentReportRequest = z.infer<typeof createCommentReportRequestSchema>;

/** One comment on the character page. */
export interface CharacterComment {
  id: string;
  body: string;
  createdAt: string;
  authorHandle: string | null;
  /** True when the viewer wrote the comment. The author cannot report their own comment. */
  isOwn: boolean;
  /** True for the author, the creator of the character, and an admin. */
  canDelete: boolean;
}

export interface CommentListResponse {
  items: CharacterComment[];
  /** Null when no more comments exist. */
  nextCursor: string | null;
  /** The number of comments on the character. */
  count: number;
}
