import { TERMS_VERSION } from "@wanderer/shared";
import type { Metadata } from "next";
import { LegalList, LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Wanderer" };

const sections: LegalSection[] = [
  {
    id: "stored",
    title: "What Wanderer stores",
    body: (
      <LegalList
        items={[
          "Your Google name, email address, and picture.",
          "Your characters and your chats.",
          "Your proxy keys, in encrypted form.",
        ]}
      />
    ),
  },
  {
    id: "sharing",
    title: "Sharing",
    body: <p>Wanderer does not sell or share your data. Your chat text goes only to the proxy that you pick.</p>,
  },
  {
    id: "reports",
    title: "Reports",
    body: (
      <p>
        When you report a character, Wanderer stores the reason, your note, and your account. Only the admin sees them.
      </p>
    ),
  },
  {
    id: "deletion",
    title: "Deletion",
    body: (
      <p>
        You can delete your account in Settings. Wanderer then removes your account, your characters, your chats, your
        proxies, and your uploads. Your reports stay for the admin, without your name or your account.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/privacy"
      lead="This page tells you what Wanderer stores about you, who sees it, and how you remove it."
      updated={TERMS_VERSION}
      sections={sections}
    />
  );
}
