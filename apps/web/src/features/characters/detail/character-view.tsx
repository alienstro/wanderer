"use client";

import type { CharacterDetail } from "@wanderer/shared";
import { type ReactNode, useId, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { ShareButton } from "@/components/ui/share-button";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { fileSrc } from "@/lib/api";
import { compactCount, statusLabel } from "@/lib/format";
import { useMe } from "@/lib/query-provider";
import { CharacterComments } from "@/features/comments";
import { LikeButton } from "./like-button";
import { StartChat } from "./start-chat";
import { useCharacterChats, YourChats } from "./your-chats";

type TabId = "chats" | "comments" | "definition";

/** One count under the bio, such as "412 Chats". */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-base font-bold">{value}</span>
      <span className="text-[11px] text-subtle">{label}</span>
    </div>
  );
}

function Definition({ detail }: { detail: CharacterDetail }) {
  if (!detail.definition) {
    return <p className="m-0 text-muted">The creator keeps the definition of this character hidden.</p>;
  }
  const parts: [string, string][] = [
    ["Personality", detail.definition.personality],
    ["Scenario", detail.definition.scenario],
    ["Example dialogs", detail.definition.exampleDialogs],
  ];
  return (
    <div className="flex flex-col gap-2">
      {parts
        .filter(([, text]) => text)
        .map(([label, text]) => (
          <div key={label} className="rounded-[14px] bg-[#0f0f11] px-4 py-3.5">
            <div className="mb-1 text-xs font-bold">{label}</div>
            <p className="m-0 whitespace-pre-wrap text-[#a1a1aa] [overflow-wrap:anywhere]">{text}</p>
          </div>
        ))}
    </div>
  );
}

/**
 * The character page body in the v2 Joyland profile layout: a blurred banner, the round avatar, the name, the bio, the
 * counts and the buttons in the center, then the tabs "Your chats", "Comments" and "Definition".
 * `actions` goes in the row of buttons, such as Report. `children` goes under the buttons, such as the owner panel.
 * All tab panels stay in the page, and only the picked one is visible, so the comments do not load again on each pick.
 */
export function CharacterView({ detail, actions, children }: { detail: CharacterDetail; actions?: ReactNode; children?: ReactNode }) {
  const id = useId();
  const image = detail.avatarUrl ? fileSrc(detail.avatarUrl) : null;
  const { data: me } = useMe();
  const chatTotal = useCharacterChats(detail.id).data?.items.length ?? 0;
  const hasChats = Boolean(me) && chatTotal > 0;
  const [picked, setPicked] = useState<TabId | null>(null);
  const tab = picked === "chats" && !hasChats ? "comments" : (picked ?? (hasChats ? "chats" : "comments"));
  const tabs: TabBarItem<TabId>[] = [
    ...(hasChats ? [{ id: "chats" as const, label: "Your chats", count: chatTotal }] : []),
    { id: "comments", label: "Comments" },
    { id: "definition", label: "Definition" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col items-center">
      <section aria-label={`About ${detail.title}`} className="flex w-full flex-col items-center text-center">
        <div aria-hidden="true" className="relative h-[200px] w-full overflow-hidden rounded-[18px] bg-surface max-[760px]:h-[140px]">
          {image && (
            <img src={image} alt="" className="absolute -top-[40%] -left-[10%] h-[180%] w-[120%] object-cover blur-[28px] brightness-[0.7] saturate-[1.3]" />
          )}
        </div>
        {image ? (
          <img
            src={image}
            alt={detail.title}
            width={112}
            height={112}
            className="relative z-[1] -mt-14 size-28 rounded-full object-cover object-[50%_15%] shadow-[0_0_0_4px_#000]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="relative z-[1] -mt-14 flex size-28 items-center justify-center rounded-full bg-[#26262b] text-[44px] font-bold text-[#5a5a64] shadow-[0_0_0_4px_#000]"
          >
            {detail.title.charAt(0).toUpperCase()}
          </span>
        )}

        <h1 className="m-0 mt-3 text-2xl leading-[1.2] font-extrabold tracking-[-0.01em] [overflow-wrap:anywhere]">{detail.title}</h1>
        <span className="mt-0.5 text-xs text-subtle">
          Chat with <strong className="text-text">{detail.chatName || detail.title}</strong> · Made by{" "}
          <span className="font-semibold text-link">@{detail.creatorHandle}</span>
        </span>
        <div className="mt-2.5 max-w-[56ch] text-[14px] leading-[1.6] text-pretty text-[#c4c4cc] [&_strong]:text-white">
          <Markdown text={detail.bio} />
        </div>
        {(detail.tags.length > 0 || detail.isAdult || detail.isOwner) && (
          <div className="mt-2.5 flex flex-wrap justify-center gap-[5px]">
            {detail.isAdult && <span className="inline-flex h-[22px] items-center rounded-full bg-[rgba(194,65,75,0.9)] px-[9px] text-[11.5px] text-white">18+</span>}
            {detail.isOwner && <span className="inline-flex h-[22px] items-center rounded-full bg-surface-2 px-[9px] text-[11.5px] text-[#c4c4cc]">{statusLabel(detail)}</span>}
            {detail.tags.map((tag) => (
              <span key={tag.slug} className="inline-flex h-[22px] items-center rounded-full bg-surface-2 px-[9px] text-[11.5px] text-[#c4c4cc]">
                {tag.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-[18px] flex justify-center gap-7">
          <Stat value={compactCount(detail.chatCount)} label="Chats" />
          <Stat value={compactCount(detail.likeCount)} label="Likes" />
          <Stat value={compactCount(detail.commentCount)} label="Comments" />
        </div>

        <div className="mt-[18px] flex flex-wrap items-start justify-center gap-2">
          <StartChat characterId={detail.id} />
          <LikeButton characterId={detail.id} likeCount={detail.likeCount} likedByMe={detail.likedByMe} isOwner={detail.isOwner} />
          <ShareButton title={detail.title} path={`/characters/${detail.id}`} />
          {actions}
        </div>
      </section>

      {children && <div className="mt-6 w-full max-w-[640px]">{children}</div>}

      <TabBar label="Character sections" idPrefix={id} tabs={tabs} current={tab} onPick={setPicked} />

      <div className="w-full max-w-[640px] pt-[18px] [&_section>h2]:sr-only">
        {hasChats && (
          <div role="tabpanel" id={`${id}-chats`} aria-labelledby={`${id}-chats-tab`} hidden={tab !== "chats"}>
            <YourChats characterId={detail.id} />
          </div>
        )}
        <div role="tabpanel" id={`${id}-comments`} aria-labelledby={`${id}-comments-tab`} hidden={tab !== "comments"}>
          <CharacterComments characterId={detail.id} />
        </div>
        <div role="tabpanel" id={`${id}-definition`} aria-labelledby={`${id}-definition-tab`} hidden={tab !== "definition"}>
          <Definition detail={detail} />
        </div>
      </div>
    </div>
  );
}
