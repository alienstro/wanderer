import { OPENINGS_MAX } from "@wanderer/shared";
import type { ReactNode } from "react";

/*
 * Small copies of the app screens for the feature blocks. They are code, not screenshots, so they stay
 * in the style of the app. They are only pictures: screen readers skip them, and the text next to them says the same.
 */

/** A node on a dotted canvas, with a violet tag as its name. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-hidden="true" className="dot-grid pointer-events-none rounded-[20px] border border-line bg-bg p-3 select-none sm:p-5">
      <div className="flex flex-col gap-4 rounded-[14px] border border-line bg-sidebar p-4 shadow-[0_24px_60px_rgb(0_0_0/0.45)] sm:p-5">
        <span className="self-start rounded-[5px] bg-accent px-2 py-0.5 text-[12px] font-medium text-white">{label}</span>
        {children}
      </div>
    </div>
  );
}

function FakeField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label text-[13px]">{label}</span>
      <div className="rounded-[12px] border border-field-line bg-surface px-3 py-2.5 text-[13px] leading-[1.55] text-[#d4d4d8]">{children}</div>
    </div>
  );
}

export function CharacterPreview() {
  return (
    <Frame label="Create a character">
      <FakeField label="Personality">Calm, with a dry humor. She keeps a log of each ship that passes the island.</FakeField>
      <FakeField label="Scenario">A storm pushes your boat to her island at midnight.</FakeField>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between">
          <span className="label text-[13px]">First messages</span>
          <span className="hint">3 of {OPENINGS_MAX}</span>
        </span>
        <span className="flex gap-1.5">
          <span className="chip min-h-[30px] bg-text px-3 font-semibold text-bg">1</span>
          <span className="chip min-h-[30px] px-3">2</span>
          <span className="chip min-h-[30px] px-3">3</span>
          <span className="chip min-h-[30px] px-3">+ Add</span>
        </span>
      </div>
      <FakeField label="Example dialogs">
        <span className="block text-muted">{"{{user}}"}: Is the light always on?</span>
        <span className="block">
          {"{{char}}"}: Each night for eleven years. <em className="text-muted">She taps the log book.</em>
        </span>
      </FakeField>
    </Frame>
  );
}

const CHOICES: { action?: string; text: string }[] = [
  { action: "I take the cup.", text: "Thank you, Mira." },
  { text: "Who else came here in a storm?" },
  { action: "I look out at the sea.", text: "Is my boat safe?" },
  { text: "Can I see the lamp?" },
];

export function ReplyChoicesPreview() {
  return (
    <Frame label="Chat">
      <div className="flex gap-3">
        <span className="av size-9 bg-[#3b2f5c] text-[15px] text-white">M</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Mira</span>
          <p className="m-0 rounded-[6px_20px_20px_20px] border border-line bg-surface px-4 py-3 text-[14px] leading-[1.6] text-[#ececee]">
            <em className="text-muted">She puts a cup of tea in front of you.</em> The storm stays until morning. You can sleep in the lamp
            room, if the noise does not stop you.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <span key={choice.text} className="choice cursor-default text-[13px]">
            {choice.action && <em>{choice.action} </em>}
            {choice.text}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-[14px] border border-field-line bg-surface px-3.5 py-2.5 text-[13px] text-subtle">
        Write your reply…
        <span className="flex items-center gap-2 text-[12px] font-semibold text-muted">
          <span className="relative h-[18px] w-8 rounded-full bg-accent">
            <span className="absolute top-[3px] right-[3px] size-3 rounded-full bg-white" />
          </span>
          Reply choices
        </span>
      </div>
    </Frame>
  );
}

const MODEL_ROWS = [
  { label: "Address", value: "https://openrouter.ai/api/v1" },
  { label: "Model", value: "deepseek/deepseek-chat" },
  { label: "API key", value: "••••••••••••3f9a" },
];

export function ModelPreview() {
  return (
    <Frame label="Models">
      <div className="flex flex-col gap-3 rounded-[14px] border border-accent/60 bg-surface p-4">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-bold">OpenRouter</span>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">Active</span>
        </span>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          {MODEL_ROWS.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-subtle">{row.label}</dt>
              <dd className="m-0 truncate font-mono text-[12.5px] text-[#d4d4d8]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <span className="flex items-center gap-2 text-[12px] text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Stored encrypted. Only the last 4 characters show.
      </span>
    </Frame>
  );
}
