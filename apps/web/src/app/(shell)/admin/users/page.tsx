"use client";

import { AdminNav, AdminUserEnergyList } from "@/features/admin";
import { useRequireLogin } from "@/lib/use-require-login";

/** The admin page for the energy of each user. A normal user sees a short message. */
export default function AdminUserEnergyPage() {
  const me = useRequireLogin();
  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <h1 className="page-title">User energy</h1>
      {me && (
        <>
          {me.role === "admin" && <AdminNav />}
          <AdminUserEnergyList />
        </>
      )}
    </div>
  );
}
