import type { CharacterCard as Card } from "@wanderer/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { fileSrc } from "@/lib/api";
import { chatsLabel, likesLabel } from "@/lib/format";
import { HeartIcon } from "./heart-icon";

const BADGE =
  "inline-flex items-center gap-[5px] rounded-full bg-[rgba(10,10,12,0.72)] px-[9px] py-1 text-xs font-semibold whitespace-nowrap text-text";

/**
 * A count badge, such as "1.2K chats". A narrow card, as in the two columns of a phone, shows only the number.
 * A screen reader still reads the word.
 */
function CountBadge({ icon, label }: { icon: ReactNode; label: string }) {
  const [count, ...word] = label.split(" ");
  return (
    <span className={BADGE}>
      {icon}
      {count}{" "}
      <span className="@max-[12rem]:sr-only">{word.join(" ")}</span>
    </span>
  );
}

/**
 * A Discover card in the StoryEngine style: a tall 3:4 image, the chat and like counts, the title, the tags, and the creator.
 * The whole card links to the character page. `extraBadge` puts one more badge at the top right, such as "Draft".
 * `linked={false}` shows the card with no link, for the form preview.
 */
export function CharacterCard({ card, extraBadge, linked = true }: { card: Card; extraBadge?: ReactNode; linked?: boolean }) {
  const body = (
    <>
      <span className="shot">
        {card.avatarUrl ? (
          <img src={fileSrc(card.avatarUrl)} alt={card.title} loading="lazy" />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-[64px] font-bold text-[#5a5a64]">
            {card.title.charAt(0).toUpperCase()}
          </span>
        )}
        {/* One row that wraps: on a narrow card the right badges go to a second line, so they do not cover the counts. */}
        <span className="absolute inset-x-2.5 top-2.5 flex flex-wrap gap-1.5">
          <span className="flex gap-1.5">
            <CountBadge
              label={chatsLabel(card.chatCount)}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
                </svg>
              }
            />
            <CountBadge label={likesLabel(card.likeCount)} icon={<HeartIcon size={12} />} />
          </span>
          <span className="ml-auto flex gap-1.5">
            {card.isAdult && <span className={`${BADGE} bg-[rgba(194,65,75,0.9)]`}>18+</span>}
            {extraBadge && <span className={BADGE}>{extraBadge}</span>}
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-1.5 px-0.5">
        <span className="text-[15px] leading-[1.3] font-bold">{card.title}</span>
        {card.tags.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map((tag) => (
              <span key={tag.slug} className="tag">
                {tag.label}
              </span>
            ))}
          </span>
        )}
        <span className="truncate text-xs text-subtle">@{card.creatorHandle}</span>
      </span>
    </>
  );
  return linked ? (
    <Link href={`/characters/${card.id}`} className="se-card @container">
      {body}
    </Link>
  ) : (
    <div className="se-card @container">{body}</div>
  );
}
