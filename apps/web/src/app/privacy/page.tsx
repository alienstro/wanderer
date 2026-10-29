import { TERMS_VERSION } from "@wanderer/shared";
import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalList, LegalPage, type LegalSection, OPERATOR_NAME } from "@/features/legal";

export const metadata: Metadata = { title: "Privacy Policy · Wanderer" };

const contactLink = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: "responsible",
    title: "Who is responsible",
    body: (
      <p>
        {OPERATOR_NAME} runs Wanderer and is responsible for your data. Send questions and requests about your data to{" "}
        {contactLink}.
      </p>
    ),
  },
  {
    id: "stored",
    title: "What Wanderer stores",
    body: (
      <LegalList
        items={[
          "From your Google account: your name, your email address, the link to your profile picture, and the ID that Google gives your account.",
          "Your handle and your settings, such as Reply choices on or off.",
          "Your characters, the avatar images that you upload, your chats, and your reports.",
          "Your proxies: the URL, the model, and your custom prompt. Your API keys stay encrypted (AES-256-GCM), and Wanderer shows only the last 4 characters.",
          "The version of these terms that you accepted, and the time.",
          "Your sessions: a hash of each login token, and the time of your last visit.",
        ]}
      />
    ),
  },
  {
    id: "why",
    title: "Why Wanderer uses it",
    body: (
      <>
        <p>
          Wanderer uses your data to log you in, to show your characters and chats, and to send your messages to your
          proxy. It also uses your data to keep the service safe, with rate limits, reports, and bans.
        </p>
        <p>Wanderer does not sell your data, and does not use it for ads.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and IP addresses",
    body: (
      <>
        <p>
          Wanderer uses one cookie, which keeps you logged in for up to 30 days. The app cannot work without it.
          Wanderer uses no analytics, no ad cookies, and no trackers.
        </p>
        <p>
          The server reads your IP address to limit how many requests one person can send. It keeps the address only in
          memory, not in the database.
        </p>
      </>
    ),
  },
  {
    id: "public",
    title: "What other people see",
    body: (
      <p>
        Other users see your handle and your public characters. They do not see your name, your email address, your
        chats, or your proxies. The admin can see account data and reports, to moderate Wanderer.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "Services that get your data",
    body: (
      <>
        <LegalList
          items={[
            "Your AI provider: when you use your own proxy, Wanderer sends the character, the chat history, your custom prompt, and your Google name to that proxy for each reply. The privacy policy of that provider then applies.",
            "OpenRouter: when you use a free model, Wanderer sends the same data to OpenRouter, and OpenRouter sends it to the company of that model. The privacy policies of OpenRouter and of that company then apply.",
            "RunPod: when you make a scene image, Wanderer sends the text prompt of the scene to RunPod.",
            "Google: Google handles your login.",
            "Cloudflare: all traffic to Wanderer goes through Cloudflare, and Cloudflare R2 keeps the daily backups.",
          ]}
        />
        <p>
          Wanderer gives data to the authorities only when the law requires it, or when it is necessary to protect the
          life of a person.
        </p>
      </>
    ),
  },
  {
    id: "safety",
    title: "Safety and emergencies",
    body: (
      <p>
        Nobody watches your chats, so Wanderer cannot know when you are in danger, and does not call emergency services
        for you. If you think about suicide or self-harm, call your local emergency number or a crisis line now. The
        Terms of Service list some numbers.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long Wanderer keeps it",
    body: (
      <p>
        Wanderer keeps your data until you delete it or delete your account. A login ends after 30 days without a visit.
        The daily backups keep a copy for up to 14 days.
      </p>
    ),
  },
  {
    id: "deletion",
    title: "Deletion",
    body: (
      <p>
        You can delete your account in Settings. Wanderer then removes your account, your characters, your chats, your
        proxies, and your uploads at once, and from the backups within 14 days. Your reports stay for the admin, without
        your name or your account.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <p>
        You can ask for a copy of your data, ask to correct it, or ask to delete it. Send an email to {contactLink} from
        the address of your account. You get an answer within 30 days.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Wanderer uses HTTPS, keeps your API keys encrypted, and stores only a hash of each login token. No system is
        fully safe, so do not put secrets in your characters or chats.
      </p>
    ),
  },
  {
    id: "age",
    title: "Age",
    body: (
      <p>
        Wanderer is only for people who are 18 or older. If you think that a person younger than 18 has an account, send
        an email to {contactLink}. The admin then deletes the account.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When this policy changes, the date at the top of this page changes. At your next login, you accept the new
        policy.
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
