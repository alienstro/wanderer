"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AdminReport, type AdminReportList, REPORT_REASON_LABELS, type ReportAction } from "@wanderer/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Pager, usePager } from "./pager";

const QUERY_KEY = ["admin-reports"];
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** The actions that change the character or the creator. They ask "Are you sure?" first. */
const CONFIRM_LABEL: Partial<Record<ReportAction, string>> = { deleted: "Yes, delete", banned: "Yes, ban" };

/** The open reports for the admin. Reports about minors come first, because the API sorts them. */
export function AdminReports() {
  const pager = usePager();
  const { cursor } = pager;
  const list = useQuery({
    queryKey: [...QUERY_KEY, cursor],
    queryFn: () => apiFetch<AdminReportList>(cursor === undefined ? "/admin/reports" : `/admin/reports?${new URLSearchParams({ cursor })}`),
    placeholderData: keepPreviousData,
  });
  const empty = list.data?.reports.length === 0;
  const { page, previous } = pager;

  // When the admin resolves the last report of a page, the page is empty, so go back one page.
  useEffect(() => {
    if (empty && page > 1 && !list.isPlaceholderData) {
      previous();
    }
  }, [empty, page, previous, list.isPlaceholderData]);

  if (list.isPending) {
    return null;
  }
  if (list.isError) {
    const forbidden = list.error instanceof ApiError && list.error.status === 403;
    return <p className="m-0 text-muted">{forbidden ? "This page is for the admin." : "The reports did not load. Try again."}</p>;
  }
  if (list.data.reports.length === 0) {
    return <p className="m-0 text-muted">No open reports.</p>;
  }
  return (
    <div className="flex max-w-[860px] flex-col gap-3">
      {list.data.reports.map((report) => (
        <ReportRow key={report.id} report={report} />
      ))}
      <Pager label="Reports pages" pager={pager} nextCursor={list.data.nextCursor} />
    </div>
  );
}

function ReportRow({ report }: { report: AdminReport }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ReportAction | null>(null);
  const resolve = useMutation({
    mutationFn: (action: ReportAction) =>
      apiFetch<AdminReport>(`/admin/reports/${report.id}/resolve`, { method: "POST", body: JSON.stringify({ action }) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  function act(action: ReportAction) {
    if (CONFIRM_LABEL[action] && confirm !== action) {
      setConfirm(action);
      return;
    }
    setConfirm(null);
    resolve.mutate(action);
  }

  const { character, comment } = report;
  const aboutComment = report.target === "comment";
  const label = aboutComment ? `Report about a comment on ${report.characterTitle}` : `Report about ${report.characterTitle}`;
  return (
    <article aria-label={label} className="flex flex-col gap-2.5 panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        {report.reason === "minors" && <span className="tag bg-[rgba(194,65,75,0.9)] text-white">Minors</span>}
        <span className="font-semibold">{REPORT_REASON_LABELS[report.reason]}</span>
        <span className="text-[13px] text-subtle">{dateFormat.format(new Date(report.createdAt))}</span>
      </div>
      <h2 className="m-0 text-base">
        {character ? (
          <Link href={`/characters/${character.id}`} className="text-link">
            {report.characterTitle}
          </Link>
        ) : (
          report.characterTitle
        )}
      </h2>
      <p className="m-0 flex flex-wrap gap-x-2 text-[13px] text-muted">
        <span>{character ? `By @${character.creatorHandle ?? "unknown"} · ${character.status}` : "Character deleted"}</span>
        <span>Reported by {report.reporterHandle ? `@${report.reporterHandle}` : "Deleted account"}</span>
      </p>
      {aboutComment && !comment && <p className="m-0 text-[13px] text-muted">Comment deleted with the account of its author</p>}
      {comment && (
        <div className="flex flex-col gap-1 rounded-[12px] border border-line px-3.5 py-2.5">
          <span className="text-[13px] text-muted">
            Comment by @{comment.authorHandle ?? "unknown"}
            {comment.deleted && " · deleted"}
          </span>
          <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.body}</p>
        </div>
      )}
      {report.note && <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{report.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pill pill-soft" disabled={resolve.isPending} onClick={() => act("none")}>
          Close
        </button>
        {character && comment && (
          <>
            {!comment.deleted && (
              <button type="button" className="pill pill-soft" disabled={resolve.isPending} onClick={() => act("hidden")}>
                Delete comment
              </button>
            )}
            <button type="button" className="pill pill-danger" disabled={resolve.isPending} onClick={() => act("banned")}>
              Ban author
            </button>
          </>
        )}
        {character && !aboutComment && (
          <>
            <button type="button" className="pill pill-soft" disabled={resolve.isPending} onClick={() => act("hidden")}>
              Hide
            </button>
            <button type="button" className="pill pill-danger" disabled={resolve.isPending} onClick={() => act("deleted")}>
              Delete
            </button>
            <button type="button" className="pill pill-danger" disabled={resolve.isPending} onClick={() => act("banned")}>
              Ban creator
            </button>
          </>
        )}
      </div>
      {confirm && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Are you sure?</span>
          <button type="button" className="pill pill-danger" onClick={() => act(confirm)}>
            {CONFIRM_LABEL[confirm]}
          </button>
          <button type="button" className="pill pill-soft" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}
      {resolve.isError && (
        <p role="alert" className="m-0 text-[13px] text-error">
          The action failed. The list loads again.
        </p>
      )}
    </article>
  );
}
