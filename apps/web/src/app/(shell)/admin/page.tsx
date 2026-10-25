"use client";

import { AdminNav } from "@/components/admin-nav";
import { AdminReports } from "@/components/admin-reports";
import { useRequireLogin } from "@/lib/use-require-login";

/** The admin page with the open reports. A visitor goes to /login, and a normal user sees a short message. */
export default function AdminPage() {
  const me = useRequireLogin();
  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <h1 className="page-title">Reports</h1>
      {me && (
        <>
          {me.role === "admin" && <AdminNav />}
          <AdminReports />
        </>
      )}
    </div>
  );
}
