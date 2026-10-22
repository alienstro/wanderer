import { TERMS_VERSION } from "@wanderer/shared";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service · Wanderer" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={TERMS_VERSION}>
      <h2>Age</h2>
      <p className="m-0">You must be 18 or older to see 18+ content.</p>
      <h2>Content that is not allowed</h2>
      <ul>
        <li>Sexual content with minors. A character marked 18+ must be an adult.</li>
        <li>Hate and harassment.</li>
        <li>Characters copied from other people without permission.</li>
      </ul>
      <h2>Reports and moderation</h2>
      <p className="m-0">
        You can report a character that breaks these rules. Each user can report a character one time, and send 10
        reports each day. The owner reads the reports and can hide or delete characters and ban accounts. A banned
        account cannot log in.
      </p>
      <h2>Your proxy</h2>
      <p className="m-0">
        You are responsible for your own proxy, your API key, and the rules of your AI provider.
      </p>
    </LegalPage>
  );
}
