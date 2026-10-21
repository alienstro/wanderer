import { z } from "zod";

export const REPORT_REASONS = ["minors", "wrong_rating", "hate", "copied", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  minors: "Sexual content with minors",
  wrong_rating: "Wrongly marked 18+",
  hate: "Hate or harassment",
  copied: "Copied character",
  other: "Other",
};

/** The admin actions. `none` closes the report and does not change the character. */
export const REPORT_ACTIONS = ["none", "hidden", "deleted", "banned"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const REPORT_NOTE_MAX = 500;

export const createReportRequestSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX).default(""),
});

export const resolveReportRequestSchema = z.object({
  action: z.enum(REPORT_ACTIONS),
});

export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
export type ResolveReportRequest = z.infer<typeof resolveReportRequestSchema>;

/** One open report on the admin page. `character` is null when the character is deleted. */
export interface AdminReport {
  id: string;
  reason: ReportReason;
  note: string;
  createdAt: string;
  /** The title when the user sent the report. It stays after the character is deleted. */
  characterTitle: string;
  character: { id: string; creatorId: string; creatorHandle: string | null; status: string } | null;
  /** Null when the reporter deleted their account. */
  reporterHandle: string | null;
}

export interface AdminReportList {
  reports: AdminReport[];
}
