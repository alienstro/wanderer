import { TERMS_VERSION } from "@wanderer/shared";
import type { Metadata } from "next";
import { LegalList, LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service · Wanderer" };

const sections: LegalSection[] = [
  {
    id: "age",
    title: "Age",
    body: <p>You must be 18 or older to see 18+ content.</p>,
  },
  {
    id: "not-allowed",
    title: "Content that is not allowed",
    body: (
      <LegalList
        marker="cross"
        items={[
          "Sexual content with minors. A character marked 18+ must be an adult.",
          "Hate and harassment.",
          "Characters copied from other people without permission.",
        ]}
      />
    ),
  },
  {
    id: "reports",
    title: "Reports and moderation",
    body: (
      <p>
        You can report a character that breaks these rules. Each user can report a character one time, and send 10
        reports each day. The owner reads the reports and can hide or delete characters and ban accounts. A banned
        account cannot log in.
      </p>
    ),
  },
  {
    id: "proxy",
    title: "Your proxy",
    body: <p>You are responsible for your own proxy, your API key, and the rules of your AI provider.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="/terms"
      lead="These rules apply to each person who uses Wanderer, and to each character on it."
      updated={TERMS_VERSION}
      sections={sections}
    />
  );
}
