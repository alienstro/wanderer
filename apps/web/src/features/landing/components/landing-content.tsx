// The text and the data of the landing page. landing-view.tsx renders them.
import { OPENINGS_MAX } from "@wanderer/shared";
import Link from "next/link";
import type { ReactNode } from "react";

export const LANDING_HEADLINE = "Talk with characters. Write the story together.";
export const LANDING_DEFINITION =
  "Wanderer is a text-only roleplay app. Pick a character or make your own, connect your own AI model, and write a story together, one message at a time.";

export const ANCHORS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

export const STEPS = [
  { tag: "Character", title: "Pick or make a character", body: "Find a character on Discover, or write your own in a few minutes." },
  { tag: "Model", title: "Connect your own model", body: "Add an OpenAI-compatible API: its address, your key, and a model name." },
  { tag: "Chat", title: "Chat, and pick a reply", body: "Write each message yourself, or click one of the four reply choices after each reply." },
];

export const FEATURES = {
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

export const TRUST: { title: string; icon: ReactNode; body: ReactNode }[] = [
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

export const FAQ: { question: string; answer: string }[] = [
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
