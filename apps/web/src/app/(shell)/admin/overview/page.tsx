"use client";

import { AdminNav, AdminOverview } from "@/features/admin";
import { useRequireLogin } from "@/lib/use-require-login";

/** The admin overview of the app. A visitor goes to /login, and a normal user sees a short message. */
export default function AdminOverviewPage() {
  const me = useRequireLogin();
  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <h1 className="page-title">Overview</h1>
      {me && (
        <>
          {me.role === "admin" && <AdminNav />}
          <AdminOverview />
        </>
      )}
    </div>
  );
}
