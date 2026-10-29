"use client";

import { useQuery } from "@tanstack/react-query";
import type { CharacterDetail, ChatMemory, SceneView } from "@wanderer/shared";
import Link from "next/link";
import { useId, useState } from "react";
import { characterQueryKey } from "@/features/characters";
import { MemoryButton } from "@/features/chats/memory/memory-panel";
import { apiFetch, fileSrc } from "@/lib/api";
import { compactCount } from "@/lib/format";
import { useMe } from "@/lib/query-provider";
import { Markdown } from "@/components/ui/markdown";

type TabId = "profile" | "memory" | "scenes";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "memory", label: "Memory" },
  { id: "scenes", label: "Scenes" },
];

export interface ChatPanelProps {
  chatId: string;
  characterId: string;
  /** The persona that the user plays in this chat, or null. */
  personaName: string | null;
  memory: ChatMemory;
  scenes: SceneView[];
  onMemorySaved: (memory: ChatMemory) => void;
}

/** One count of the panel, such as "412 Chats". */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-base font-bold">{compactCount(value)}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

/**
 * The character panel at the right of the chat, as in the v2 design: the full image of the character with the name, the
 * tags and the counts on it, then the tabs Profile, Memory and Scenes. It loads the character with the key of the character
 * page, so both pages share one copy.
 */
export function ChatPanel({ chatId, characterId, personaName, memory, scenes, onMemorySaved }: ChatPanelProps) {
  const id = useId();
  const { data: me } = useMe();
  const [tab, setTab] = useState<TabId>("profile");
  const query = useQuery({
    queryKey: characterQueryKey(characterId, me?.id ?? null),
    queryFn: () => apiFetch<CharacterDetail>(`/characters/${encodeURIComponent(characterId)}`),
    enabled: me !== undefined,
  });
  const character = query.data;
  const image = character?.avatarUrl ? fileSrc(character.avatarUrl) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#141016]">
      <div className="relative flex min-h-[260px] flex-[0_0_52%] flex-col justify-end overflow-hidden bg-[#241a14]">
        {image && <img src={image} alt={character?.title ?? ""} className="absolute inset-0 size-full object-cover object-top" />}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,#141016_0%,rgba(20,16,22,0.92)_32%,rgba(20,16,22,0)_62%)]" />
        {character && (
          <div className="relative flex flex-col gap-3 px-5 pb-3.5">
            <Link href={`/characters/${character.id}`} className="inline-flex items-center gap-1 self-start text-lg font-extrabold text-white no-underline">
              {character.title}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
            {character.tags.length > 0 && (
              <div className="flex flex-wrap gap-[5px]">
                {character.tags.map((tag) => (
                  <span key={tag.slug} className="inline-flex h-[22px] items-center rounded-md border border-white/20 px-2 text-[11px] text-[#e4e4e7]">
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 py-1.5">
              <Stat value={character.likeCount} label="Likes" />
              <div className="border-l border-white/10">
                <Stat value={character.chatCount} label="Chats" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Chat panel" className="grid flex-none grid-cols-3 border-y border-white/10">
        {TABS.map((item) => {
          const on = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${id}-${item.id}-tab`}
              aria-selected={on}
              aria-controls={`${id}-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`h-10 cursor-pointer border-0 border-b-2 bg-transparent text-xs font-semibold ${on ? "border-white text-white" : "border-transparent text-subtle"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div role="tabpanel" id={`${id}-profile`} aria-labelledby={`${id}-profile-tab`} hidden={tab !== "profile"} className="flex flex-col gap-3">
          {character && (
            <div className="text-[13.5px] leading-[1.6] text-[#c4c4cc] [&_strong]:text-white">
              <Markdown text={character.bio} />
            </div>
          )}
          {personaName && (
            <p className="m-0 text-xs text-muted">
              You play as <strong className="text-text">{personaName}</strong>
            </p>
          )}
        </div>
        <div role="tabpanel" id={`${id}-memory`} aria-labelledby={`${id}-memory-tab`} hidden={tab !== "memory"} className="flex flex-col gap-3">
          <p className="m-0 text-[13.5px] leading-[1.6] whitespace-pre-wrap text-[#c4c4cc]">
            {memory.text || "No memory yet. The memory keeps the facts of a long chat."}
          </p>
          <div>
            <MemoryButton label="Edit memory" chatId={chatId} memory={memory} onSaved={onMemorySaved} />
          </div>
        </div>
        <div role="tabpanel" id={`${id}-scenes`} aria-labelledby={`${id}-scenes-tab`} hidden={tab !== "scenes"}>
          {scenes.length === 0 ? (
            <p className="m-0 text-[13.5px] text-muted">No scenes yet. Use Generate scene under the text box to make one.</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
              {scenes.map((scene, index) => (
                <li key={scene.id}>
                  <a href={fileSrc(scene.url)} target="_blank" rel="noreferrer" className="block">
                    <img src={fileSrc(scene.url)} alt={`Scene image ${index + 1}`} loading="lazy" className="aspect-square w-full rounded-[10px] object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** The button at the top right of the chat that shows and hides the character panel. */
export function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn tap-target absolute top-4 right-4 z-[1] rounded-full bg-black/50 max-[760px]:top-2 max-[760px]:right-2"
      aria-label={open ? "Hide the character panel" : "Show the character panel"}
      aria-expanded={open}
      onClick={onToggle}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M15 4v16" />
      </svg>
    </button>
  );
}

/** The column of the character panel at the right of the chat. On a phone it covers the chat, so it has its own close button. */
export function PanelAside({ onClose, ...panel }: ChatPanelProps & { onClose: () => void }) {
  return (
    <aside
      aria-label="About the character"
      className="relative h-full w-[360px] flex-none border-l border-line max-[1100px]:w-[300px] max-[760px]:fixed max-[760px]:inset-0 max-[760px]:z-40 max-[760px]:w-full max-[760px]:border-l-0"
    >
      <button
        type="button"
        className="icon-btn tap-target absolute top-2 right-2 z-[1] rounded-full bg-black/50 min-[761px]:hidden"
        aria-label="Close the character panel"
        onClick={onClose}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <ChatPanel {...panel} />
    </aside>
  );
}
