"use client";

import { SettingsView } from "@/components/settings-view";
import { useRequireLogin } from "@/lib/use-require-login";

/** The account settings page. A visitor goes to /login. */
export default function SettingsPage() {
  const me = useRequireLogin();
  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">Settings</h1>
      {me && <SettingsView me={me} />}
    </div>
  );
}
