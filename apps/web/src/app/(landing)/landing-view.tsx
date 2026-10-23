import { type CharacterCard as Card, OPENINGS_MAX } from "@wanderer/shared";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CharacterCard } from "@/components/character-card";
import { Logo } from "@/components/logo";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/legal";
import { CharacterPreview, ModelPreview, ReplyChoicesPreview } from "./feature-previews";
import { SessionRedirect } from "./session-redirect";

export const LANDING_HEADLINE = "Talk with characters. Write the story together.";
export const LANDING_DEFINITION =
  "Wanderer is a text-only roleplay app. Pick a character or make your own, connect your own AI model, and write a story together, one message at a time.";

/** The side space of each section. The page has no max width: the content fills the width next to the edges. */
const GUTTER = "px-4 sm:px-8 lg:px-14";

const ANCHORS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

const STEPS = [
  { tag: "Character", title: "Pick or make a character", body: "Find a character on Discover, or write your own in a few minutes." },
  { tag: "Model", title: "Connect your own model", body: "Add an OpenAI-compatible API: its address, your key, and a model name." },
  { tag: "Chat", title: "Chat, and pick a reply", body: "Write each message yourself, or click one of the four reply choices after each reply." },
];

const FEATURES = {
  create: {
    title: "Make your own character",
    body: "Give your character a personality and a scenario. The model reads them before each reply, so the character stays the same from the first message to the last.",
    points: [
      `Up to ${OPENINGS_MAX} first messages, so each chat can start in a different way.`,
      "Example dialogs that show how the character talks.",
      "Publish the character on Discover, or keep it private.",
    ],
  },
  choices: {
    title: "Reply choices after each reply",
    body: "After each reply, Wanderer shows four short replies above the text box. Click one to send it, or write your own reply.",
    points: ["Get new choices when none of them fits.", "Turn the choices off with one switch."],
  },
  model: {
    title: "Your model, your key",
    body: "Wanderer does not sell a model. You connect a model that you pick, from any service with an OpenAI-compatible API.",
    points: [
      "Change the model at any time, and keep your chats.",
      "Your key is stored encrypted, and the page shows only its last 4 characters.",
    ],
  },
};

const TRUST: { title: string; icon: ReactNode; body: ReactNode }[] = [
  {
    title: "18+ only",
    icon: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />,
    body: "Wanderer is for people who are 18 or older. You confirm your age when you log in. 18+ characters stay hidden until you turn them on in Settings.",
  },
  {
    title: "Report a character",
    icon: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
    body: "Each character page has a Report button. The admin reads each report, and can hide the character or ban the creator.",
  },
  {
    title: "Clear rules",
    icon: (
      <>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M10 12h5M10 16h5" />
      </>
    ),
    body: (
      <>
        Read what is allowed in the <Link href="/terms">Terms of Service</Link>, and what Wanderer keeps about you in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </>
    ),
  },
];

const FAQ: { question: string; answer: string }[] = [
  {
    question: "What is Wanderer?",
    answer:
      "Wanderer is a text-only roleplay app. You chat with characters that other people made, or with characters that you make. An AI model writes the replies of the character.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Wanderer is free. Your model service can charge you for the replies of your model, at the price of that service.",
  },
  {
    question: "Which models work?",
    answer:
      "Each model behind an OpenAI-compatible chat API works, for example from OpenRouter or DeepSeek. The address must start with https://.",
  },
  {
    question: "Where does my API key stay?",
    answer:
      "The key stays on the Wanderer server, encrypted with AES-256-GCM. The server uses it only to send your chats to your model. The browser never gets the full key back.",
  },
  {
    question: "Why is Wanderer 18+ only?",
    answer:
      "Roleplay can go to adult themes, and creators can mark a character 18+. So Wanderer is for adults only, and you confirm your age before you log in.",
  },
];

/** A vertical offset and a turn for each card, so that a row of cards makes a soft wave. */
function wave(index: number, height: number): CSSProperties {
  return {
    "--y": `${Math.round(Math.sin(index * 0.9) * height)}px`,
    "--r": `${(Math.sin(index * 0.9 + 1) * 2).toFixed(1)}deg`,
  } as CSSProperties;
}

const WAVE_ITEM = "md:[transform:translateY(var(--y))_rotate(var(--r))]";

function SectionTitle({ id, centered, children }: { id: string; centered?: boolean; children: ReactNode }) {
  return (
    <h2
      id={id}
      className={`m-0 text-[clamp(30px,4.2vw,52px)] leading-[1.05] font-medium tracking-[-0.03em] ${centered ? "text-center" : ""}`}
    >
      {children}
    </h2>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 flex-none text-accent-hover"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The main CTA: a pill with an icon circle and two soft rings around it. */
function CallToAction() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <Link
        href="/login"
        className="inline-flex min-h-14 items-center gap-3 rounded-full bg-accent py-1.5 pr-7 pl-1.5 text-[16px] font-semibold text-white no-underline shadow-[0_0_0_7px_rgb(99_46_255/0.14),0_0_0_15px_rgb(99_46_255/0.06)] hover:bg-accent-hover"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-white text-accent">
          <Arrow />
        </span>
        Log in with Google
      </Link>
      <Link href="/discover" className="pill pill-soft min-h-14 px-7 text-[16px]">
        Browse characters
      </Link>
    </div>
  );
}

function FeatureText({ id, feature }: { id: string; feature: (typeof FEATURES)[keyof typeof FEATURES] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 id={id} className="m-0 text-[clamp(22px,2.2vw,28px)] leading-[1.15] font-semibold tracking-[-0.02em]">
        {feature.title}
      </h3>
      <p className="m-0 max-w-[64ch] text-[16px] leading-relaxed text-muted">{feature.body}</p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {feature.points.map((point) => (
          <li key={point} className="flex max-w-[64ch] gap-2.5 text-[15px] leading-relaxed text-[#d4d4d8]">
            <Check />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The landing page: header, hero, how it works, features, safety, FAQ, closing CTA, and footer. */
export function LandingView({ characters }: { characters: Card[] }) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <SessionRedirect />
      <header className="sticky top-0 z-30 px-2 sm:px-4">
        <div className="flex items-center justify-between gap-3 rounded-b-[18px] border border-t-0 border-line bg-sidebar/85 py-2.5 pr-2.5 pl-1 backdrop-blur-md sm:pr-3">
          <Logo />
          <nav aria-label="On this page" className="hidden items-center gap-1 lg:flex">
            {ANCHORS.map((anchor) => (
              <a key={anchor.href} href={anchor.href} className="pill pill-ghost pill-sm font-medium">
                {anchor.label}
              </a>
            ))}
          </nav>
          <nav aria-label="Main" className="flex items-center gap-1.5">
            {/* A phone has no space for both links. The hero has a Discover link ("Browse characters") too. */}
            <Link href="/discover" className="pill pill-ghost pill-sm max-sm:hidden">
              Discover
            </Link>
            <Link href="/login" className="pill pill-accent pill-sm">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="relative">
          {/* Thin lines and empty frames around the title, as on a drawing board. Only pictures. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 max-md:hidden">
            <div className="absolute inset-x-0 -top-24 h-[620px] bg-[radial-gradient(50%_60%_at_50%_0%,rgb(99_46_255/0.26),transparent_70%)]" />
            <span className="absolute inset-x-0 top-[318px] h-px bg-line" />
            <span className="absolute top-12 left-0 h-[360px] w-[9vw] border border-l-0 border-line" />
            <span className="absolute -top-20 left-[22%] h-[130px] w-[11vw] border border-t-0 border-line" />
            <span className="absolute top-[230px] right-0 h-[300px] w-[12vw] border border-r-0 border-line" />
          </div>
          <div className={`relative flex flex-col items-center gap-7 pt-16 pb-14 text-center sm:pt-24 ${GUTTER}`}>
            <span className="text-[14px] font-semibold text-muted">
              Text roleplay for adults · <span className="text-text underline decoration-line underline-offset-4">18+ only</span>
            </span>
            <h1 id="hero-title" className="m-0 max-w-[15ch] text-balance text-[clamp(40px,7vw,92px)] leading-[0.98] font-bold tracking-[-0.045em]">
              {LANDING_HEADLINE}
            </h1>
            <p className="m-0 max-w-[56ch] text-balance text-[17px] leading-relaxed text-muted sm:text-[19px]">{LANDING_DEFINITION}</p>
            <div className="pt-2">
              <CallToAction />
            </div>
            <p className="m-0 text-[13px] text-subtle">Free to use. You bring your own model.</p>
          </div>
          {characters.length > 0 && (
            <section aria-label="Popular characters" className="relative flex flex-col gap-4 pb-10">
              <p className="m-0 text-center text-[13px] font-semibold tracking-[0.08em] text-subtle uppercase">Popular on Wanderer</p>
              <ul
                className={`m-0 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto pt-6 pb-10 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)] [scrollbar-width:none] ${GUTTER}`}
              >
                {characters.map((card, index) => (
                  <li key={card.id} style={wave(index, 18)} className={`w-[168px] flex-none snap-center sm:w-[196px] ${WAVE_ITEM}`}>
                    <CharacterCard card={card} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <section id="how" aria-labelledby="how-title" className={`flex scroll-mt-24 flex-col gap-10 py-16 sm:py-24 ${GUTTER}`}>
          <div className="flex flex-col items-center gap-3 text-center">
            <SectionTitle id="how-title" centered>
              How it works
            </SectionTitle>
            <p className="m-0 max-w-[56ch] text-[17px] text-muted">Three steps, from a blank page to your first reply.</p>
          </div>
          <div className="dot-grid rounded-[28px] border border-line bg-[#111114] px-5 py-8 sm:px-10 sm:py-12">
            <ol className="m-0 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-16">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className={`relative flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5 md:self-start shadow-[0_20px_50px_rgb(0_0_0/0.4)] ${index === 1 ? "md:mt-16" : ""}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold text-subtle">Step {index + 1}</span>
                    <span className="rounded-[5px] bg-accent px-2 py-0.5 text-[12px] font-medium text-white">{step.tag}</span>
                  </span>
                  <h3 className="m-0 text-[18px] font-semibold">{step.title}</h3>
                  <p className="m-0 max-w-[64ch] text-[15px] leading-relaxed text-muted">{step.body}</p>
                  {index < STEPS.length - 1 && (
                    <>
                      {/* The link to the next node: a curve on a wide screen, a line on a phone. */}
                      <span aria-hidden="true" className="absolute top-full left-8 h-10 w-px bg-accent/70 md:hidden" />
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 64 64"
                        className={`absolute left-full hidden h-16 w-16 overflow-visible text-accent-hover md:block ${index === 0 ? "top-[44px]" : "-top-5"}`}
                      >
                        <path
                          d={index === 0 ? "M0 0 C34 0 30 64 64 64" : "M0 64 C34 64 30 0 64 0"}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <circle cx="0" cy={index === 0 ? 0 : 64} r="4" fill="var(--color-bg)" stroke="currentColor" strokeWidth="2" />
                        <circle cx="64" cy={index === 0 ? 64 : 0} r="4" fill="var(--color-bg)" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className={`flex scroll-mt-24 flex-col gap-10 py-16 sm:py-24 ${GUTTER}`}>
          <div className="flex flex-col items-center gap-3 text-center">
            <SectionTitle id="features-title" centered>
              Built for long stories
            </SectionTitle>
            <p className="m-0 max-w-[56ch] text-[17px] text-muted">Characters that stay in their role, and a chat that keeps the story moving.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <article aria-labelledby="create-title" className="flex flex-col justify-between gap-8 rounded-[28px] border border-line bg-surface p-6 sm:p-9">
              <FeatureText id="create-title" feature={FEATURES.create} />
              <CharacterPreview />
            </article>
            <article
              aria-labelledby="choices-title"
              className="flex flex-col justify-between gap-8 rounded-[28px] border border-accent/45 bg-surface p-6 shadow-[inset_0_0_60px_rgb(99_46_255/0.22)] sm:p-9"
            >
              <FeatureText id="choices-title" feature={FEATURES.choices} />
              <ReplyChoicesPreview />
            </article>
            <article
              aria-labelledby="model-title"
              className="grid items-center gap-8 rounded-[28px] border border-line bg-surface p-6 sm:p-9 lg:col-span-2 lg:grid-cols-2 lg:gap-14"
            >
              <FeatureText id="model-title" feature={FEATURES.model} />
              <ModelPreview />
            </article>
          </div>
        </section>

        <section id="safety" aria-labelledby="trust-title" className={`flex scroll-mt-24 flex-col gap-10 py-16 sm:py-24 ${GUTTER}`}>
          <SectionTitle id="trust-title" centered>
            Made for adults, with clear rules
          </SectionTitle>
          <div className="grid gap-5 md:grid-cols-3">
            {TRUST.map((item) => (
              <div key={item.title} className="flex flex-col gap-3 rounded-[24px] border border-line bg-surface p-7">
                <span className="flex size-11 items-center justify-center rounded-full bg-accent/15 text-link">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {item.icon}
                  </svg>
                </span>
                <h3 className="m-0 text-[18px] font-semibold">{item.title}</h3>
                <p className="m-0 max-w-[64ch] text-[15px] leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className={`flex scroll-mt-24 flex-col items-center gap-10 py-16 sm:py-24 ${GUTTER}`}>
          <SectionTitle id="faq-title" centered>
            Questions
          </SectionTitle>
          <div className="flex w-full max-w-[860px] flex-col gap-3">
            {FAQ.map((item) => (
              <details key={item.question} className="group rounded-[20px] border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="flex size-8 flex-none items-center justify-center rounded-full bg-surface-2 text-[18px] leading-none text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="m-0 max-w-[64ch] px-6 pb-6 text-[15px] leading-relaxed text-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="start-title" className={`py-16 sm:py-24 ${GUTTER}`}>
          <div className="dot-grid relative flex flex-col items-center gap-6 overflow-hidden rounded-[32px] border border-line bg-sidebar px-6 pt-16 text-center sm:pt-24">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_100%,rgb(99_46_255/0.32),transparent_70%)]"
            />
            <h2 id="start-title" className="gradient-title relative m-0 text-[clamp(40px,7vw,96px)] leading-[1] font-medium tracking-[-0.04em]">
              Start your first story
            </h2>
            <p className="relative m-0 max-w-[52ch] text-balance text-[17px] leading-relaxed text-muted">
              Log in with Google, connect your model, and pick a character. It takes a few minutes.
            </p>
            <div className="relative">
              <CallToAction />
            </div>
            {characters.length > 0 ? (
              <ul aria-hidden="true" className="relative m-0 mt-2 flex list-none justify-center gap-3 px-0 pt-12 pb-0 [mask-image:linear-gradient(180deg,#000_55%,transparent)]">
                {characters.slice(0, 7).map((card, index) => (
                  <li key={card.id} style={wave(index + 2, 28)} className={`w-[120px] flex-none sm:w-[150px] ${WAVE_ITEM}`}>
                    <CharacterCard card={card} linked={false} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-16" />
            )}
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden pt-6">
        <p
          aria-hidden="true"
          className="m-0 text-center font-display text-[13.5vw] leading-[0.8] font-bold tracking-[0.06em] whitespace-nowrap text-white/[0.04] select-none"
        >
          WANDERER
        </p>
        <div className={`relative -mt-[5vw] pb-8 ${GUTTER}`}>
          <div className="flex flex-col gap-8 rounded-[24px] border border-line bg-sidebar p-7 sm:p-10">
            <div className="grid gap-8 md:grid-cols-[1.6fr_repeat(3,1fr)]">
              <div className="flex flex-col gap-3">
                <Logo />
                <p className="m-0 max-w-[36ch] px-2.5 text-[14px] leading-relaxed text-muted">
                  Text roleplay with AI characters. For people who are 18 or older.
                </p>
              </div>
              <nav aria-label="Footer: explore" className="flex flex-col gap-2.5 text-[14px]">
                <span className="text-[12px] font-semibold tracking-[0.08em] text-subtle uppercase">Explore</span>
                <Link href="/discover" className="text-muted no-underline hover:text-text">Discover</Link>
                <Link href="/login" className="text-muted no-underline hover:text-text">Log in</Link>
              </nav>
              <nav aria-label="Footer: legal" className="flex flex-col gap-2.5 text-[14px]">
                <span className="text-[12px] font-semibold tracking-[0.08em] text-subtle uppercase">Legal</span>
                <Link href="/terms" className="text-muted no-underline hover:text-text">Terms of Service</Link>
                <Link href="/privacy" className="text-muted no-underline hover:text-text">Privacy Policy</Link>
              </nav>
              <div className="flex flex-col gap-2.5 text-[14px]">
                <span className="text-[12px] font-semibold tracking-[0.08em] text-subtle uppercase">Contact</span>
                <a href={`mailto:${CONTACT_EMAIL}`} className="break-all text-muted no-underline hover:text-text">
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>
            <p className="m-0 border-t border-line pt-6 text-[13px] text-subtle">Wanderer is run by {OPERATOR_NAME}.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
