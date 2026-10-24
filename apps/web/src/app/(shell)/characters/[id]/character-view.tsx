import type { CharacterDetail } from "@wanderer/shared";
import { Markdown } from "@/components/markdown";
import { fileSrc } from "@/lib/api";
import { chatsLabel, statusLabel } from "@/lib/format";
import { CharacterComments } from "./comments";
import { StartChat } from "./start-chat";
import { YourChats } from "./your-chats";

/**
 * The character page body in the prototype style. It has the banner, the openings with Start, Your chats,
 * the definition, and the comments.
 */
export function CharacterView({ detail }: { detail: CharacterDetail }) {
  const image = detail.avatarUrl ? fileSrc(detail.avatarUrl) : null;

  return (
    <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-8">
      <section className="relative overflow-hidden panel">
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="absolute -inset-[60px] h-[calc(100%+120px)] w-[calc(100%+120px)] object-cover opacity-50 blur-[40px] saturate-[1.25]"
          />
        )}
        <div className="relative flex flex-wrap items-end gap-7 bg-[linear-gradient(180deg,rgba(14,14,16,0.25)_0%,rgba(14,14,16,0.9)_100%)] p-7 max-[760px]:p-5">
          {image ? (
            <img
              src={image}
              alt={detail.title}
              width={210}
              height={280}
              className="h-[280px] flex-[0_0_210px] rounded-[18px] object-cover shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-[280px] flex-[0_0_210px] items-center justify-center rounded-[18px] bg-[#26262b] text-[80px] font-bold text-[#5a5a64]"
            >
              {detail.title.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
            <h1 className="page-title [overflow-wrap:anywhere]">{detail.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-[#c4c4cc]">
              <span>
                Chat with <strong className="text-text">{detail.chatName || detail.title}</strong>
              </span>
              <span>
                By <span className="font-semibold text-link">@{detail.creatorHandle}</span>
              </span>
              <span>{chatsLabel(detail.chatCount)}</span>
              {detail.isAdult && <span className="tag bg-[rgba(194,65,75,0.9)] text-white">18+</span>}
              {detail.isOwner && <span className="tag">{statusLabel(detail)}</span>}
            </div>
            <div className="max-w-[64ch] text-[15px] leading-[1.6] text-[#e4e4e7]">
              <Markdown text={detail.bio} />
            </div>
            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <span key={tag.slug} className="tag px-2.5 py-[3px] text-xs">
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <StartChat characterId={detail.id} openings={detail.openings} />

      <YourChats characterId={detail.id} />

      <section aria-labelledby="def-h" className="flex flex-col gap-3">
        <h2 id="def-h" className="m-0 text-lg font-bold">
          Definition
        </h2>
        {detail.definition ? (
          <details className="rounded-[16px] border border-line bg-surface">
            <summary className="flex min-h-[46px] cursor-pointer items-center px-4 font-semibold">Show the personality and scenario</summary>
            <div className="flex flex-col gap-2.5 px-4 pb-4 whitespace-pre-wrap text-[#c4c4cc] [overflow-wrap:anywhere]">
              <p className="m-0">
                <strong className="text-text">Personality:</strong> {detail.definition.personality}
              </p>
              {detail.definition.scenario && (
                <p className="m-0">
                  <strong className="text-text">Scenario:</strong> {detail.definition.scenario}
                </p>
              )}
              {detail.definition.exampleDialogs && (
                <p className="m-0">
                  <strong className="text-text">Example dialogs:</strong> {detail.definition.exampleDialogs}
                </p>
              )}
            </div>
          </details>
        ) : (
          <p className="m-0 text-muted">The creator keeps the definition of this character hidden.</p>
        )}
      </section>

      <CharacterComments characterId={detail.id} />
    </div>
  );
}
