import { TERMS_VERSION } from "@wanderer/shared";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Wanderer" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={TERMS_VERSION}>
      <h2>What Wanderer stores</h2>
      <ul>
        <li>Your Google name, email address, and picture.</li>
        <li>Your characters and your chats.</li>
        <li>Your proxy keys, in encrypted form.</li>
      </ul>
      <h2>Sharing</h2>
      <p className="m-0">
        Wanderer does not sell or share your data. Your chat text goes only to the proxy that you pick.
      </p>
      <h2>Deletion</h2>
      <p className="m-0">You can delete your account and all your data in the settings.</p>
    </LegalPage>
  );
}
