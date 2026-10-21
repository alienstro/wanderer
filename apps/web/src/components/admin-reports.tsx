"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AdminReport, type AdminReportList, REPORT_REASON_LABELS, type ReportAction } from "@wanderer/shared";
import Link from "next/link";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

const QUERY_KEY = ["admin-reports"];
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** The actions that change the character or the creator. They ask "Are you sure?" first. */
const CONFIRM_LABEL: Partial<Record<ReportAction, string>> = { deleted: "Yes, delete", banned: "Yes, ban" };

/** The open reports for the admin. Reports about minors come first, because the API sorts them. */
export function AdminReports() {
  const list = useQuery({ queryKey: QUERY_KEY, queryFn: () => apiFetch<AdminReportList>("/admin/reports") });

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

  const { character } = report;
  return (
    <article aria-label={`Report about ${report.characterTitle}`} className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-5">
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
      {report.note && <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{report.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pill pill-soft" disabled={resolve.isPending} onClick={() => act("none")}>
          Close
        </button>
        {character && (
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
