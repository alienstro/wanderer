"use client";

import { AdminModels } from "@/components/admin-models";
import { AdminNav } from "@/components/admin-nav";
import { useRequireLogin } from "@/lib/use-require-login";

/** The admin page for the free models, the scene models and the energy settings. A normal user sees a short message. */
export default function AdminModelsPage() {
  const me = useRequireLogin();
  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <h1 className="page-title">Energy and models</h1>
      {me && (
        <>
          {me.role === "admin" && <AdminNav />}
          <AdminModels />
        </>
      )}
    </div>
  );
}
