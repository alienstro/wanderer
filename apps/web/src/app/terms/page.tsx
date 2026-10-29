import { TERMS_VERSION } from "@wanderer/shared";
import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalList, LegalPage, type LegalSection, OPERATOR_NAME } from "@/features/legal";

export const metadata: Metadata = { title: "Terms of Service · Wanderer" };

const contactLink = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Who runs Wanderer",
    body: (
      <>
        <p>
          {OPERATOR_NAME} runs Wanderer as a person, not as a company, and is its admin. These terms are an agreement
          between you and {OPERATOR_NAME}.
        </p>
        <p>When you log in, you accept these terms and the Privacy Policy. If you do not accept them, do not use Wanderer.</p>
      </>
    ),
  },
  {
    id: "age",
    title: "Age",
    body: (
      <>
        <p>You must be 18 or older to use Wanderer. If you are younger than 18, do not make an account.</p>
        <p>
          18+ characters stay hidden until you turn them on in Settings. When the admin finds an account of a person
          younger than 18, the admin deletes it.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <p>
        You log in with your Google account. You are responsible for all activity on your Wanderer account, so keep your
        Google account safe.
      </p>
    ),
  },
  {
    id: "your-content",
    title: "Your characters and chats",
    body: (
      <>
        <p>You keep the rights to the characters, the images, and the text that you make on Wanderer.</p>
        <p>
          When you make a character public, you let Wanderer store it, show it to other users, and send it to the proxy
          of each user who chats with it. This permission stops when you delete the character.
        </p>
        <p>When you delete a character, Wanderer also deletes all chats with it, including the chats of other users.</p>
      </>
    ),
  },
  {
    id: "not-allowed",
    title: "Content that is not allowed",
    body: (
      <LegalList
        marker="cross"
        items={[
          "Sexual content with minors, or with a character that looks or acts like a minor. A character marked 18+ must be an adult.",
          "Sexual content about a real person.",
          "Content that is illegal.",
          "Content that encourages, praises, or gives instructions for suicide, self-harm, or eating disorders.",
          "Hate, harassment, and threats against real people.",
          "Private information about another person, such as an address or a phone number.",
          "Characters, images, or text copied from other people without permission.",
          "Spam, malware, and attempts to break Wanderer, overload it, or get around its limits.",
        ]}
      />
    ),
  },
  {
    id: "fiction",
    title: "Characters are AI, and the chats are fiction",
    body: (
      <>
        <p>
          Each character on Wanderer is an AI character, not a real person. An AI model writes each reply: a free model
          through OpenRouter, or the model of your own proxy. Wanderer and the creators of characters do not write the
          replies, and do not check them before you see them.
        </p>
        <p>
          Everything that a character says is fiction. A reply can be wrong, offensive, upsetting, or strange. Do not
          believe a reply as a fact, and do not do in real life what a character tells you to do.
        </p>
        <p>The replies are not medical, mental-health, legal, financial, or other professional advice.</p>
      </>
    ),
  },
  {
    id: "safety",
    title: "Your safety",
    body: (
      <>
        <p>
          Wanderer is not a crisis service, a therapy service, or a medical service. A character cannot help you in an
          emergency, and nobody watches the chats.
        </p>
        <p>
          If you think about suicide or self-harm, or if you are in danger, stop the chat and get help now. Call your
          local emergency number. In the United States, call or text 988. In the Philippines, call the NCMH crisis line
          at 1553. For other countries, find a free helpline at{" "}
          <a href="https://findahelpline.com" rel="noopener noreferrer" target="_blank">
            findahelpline.com
          </a>
          .
        </p>
        <p>Take breaks. If the chats make you feel worse, stop using Wanderer, and talk to a person that you trust.</p>
      </>
    ),
  },
  {
    id: "proxy",
    title: "Your proxy",
    body: (
      <p>
        You are responsible for your own proxy, your API key, and the rules of your AI provider. Wanderer does not
        control your AI provider, and is not responsible for its costs, its limits, or what it does with your text.
      </p>
    ),
  },
  {
    id: "reports",
    title: "Reports and moderation",
    body: (
      <>
        <p>
          You can report a character that breaks these rules. Each user can report a character one time, and send 10
          reports each day.
        </p>
        <p>
          The admin reads the reports. The admin can hide or delete characters and ban accounts, with or without a
          report. A banned account cannot log in.
        </p>
      </>
    ),
  },
  {
    id: "copyright",
    title: "Copyright",
    body: (
      <p>
        If a character uses your work without your permission, report the character, or send an email to {contactLink}.
        Include a link to the character and show that the work is yours. The admin removes content that breaks these
        terms.
      </p>
    ),
  },
  {
    id: "ending",
    title: "End of your account",
    body: (
      <p>
        You can delete your account at any time in Settings. The admin can ban or delete an account that breaks these
        terms.
      </p>
    ),
  },
  {
    id: "no-warranty",
    title: "No warranty",
    body: (
      <>
        <p>
          Wanderer is a free service, and it comes &ldquo;as is&rdquo;. It can have bugs, lose data, or stop at any
          time, with or without notice.
        </p>
        <p>You use Wanderer at your own risk. You are responsible for your decisions and your actions.</p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limits of responsibility",
    body: (
      <>
        <p>
          As far as the law allows, {OPERATOR_NAME} is not responsible for harm that comes from your use of Wanderer,
          from the replies of an AI model, from your proxy or your AI provider, from the content of other users, or from
          what you do after a chat. This includes personal injury, self-harm, emotional distress, and the loss of data
          or money.
        </p>
        <p>
          As far as the law allows, the total responsibility of {OPERATOR_NAME} for all claims about Wanderer is 50 US
          dollars.
        </p>
        <p>
          Some laws do not let a service limit its responsibility in these ways. Where such a law applies to you, these
          limits apply only as far as that law allows.
        </p>
      </>
    ),
  },
  {
    id: "claims",
    title: "Claims about your content",
    body: (
      <p>
        If another person makes a claim against {OPERATOR_NAME} because of your characters, your content, or your misuse
        of Wanderer, you agree to pay the costs of that claim, as far as the law allows.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        When these terms change, the date at the top of this page changes. At your next login, you accept the new terms.
        If you do not accept them, stop using Wanderer and delete your account.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Send questions about these terms to {contactLink}.</p>,
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
