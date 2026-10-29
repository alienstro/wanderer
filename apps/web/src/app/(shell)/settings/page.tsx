"use client";

import { SettingsView } from "@/features/settings";
import { useRequireLogin } from "@/lib/use-require-login";
import { Avatar } from "@/components/ui/avatar";

/** The account settings page. A visitor goes to /login. */
export default function SettingsPage() {
  const me = useRequireLogin();
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3.5 px-8 pt-8 pb-14 max-[760px]:px-4">
      <header className="mb-3 flex flex-col items-center gap-1 text-center">
        {me && <Avatar name={me.name} src={me.pictureUrl} size={64} />}
        <h1 className="m-0 mt-2 text-2xl font-extrabold tracking-[-0.01em]">Settings</h1>
        {me && (
          <span className="text-subtle">
            {me.name}
            {me.handle && `, @${me.handle}`}
          </span>
        )}
      </header>
      {me && <SettingsView me={me} />}
    </div>
  );
}
