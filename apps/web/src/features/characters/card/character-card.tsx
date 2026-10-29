import type { CharacterCard as Card } from "@wanderer/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { fileSrc } from "@/lib/api";
import { chatsLabel, likesLabel } from "@/lib/format";
import { HeartIcon } from "@/components/ui/heart-icon";

/**
 * A count on the card, such as "1.2K chats". A narrow card, as in the two columns of a phone, shows only the number.
 * A screen reader still reads the word.
 */
function Count({ icon, label }: { icon: ReactNode; label: string }) {
  const [count, ...word] = label.split(" ");
  return (
    <span className="inline-flex items-center gap-[5px] whitespace-nowrap">
      {icon}
      {count}{" "}
      <span className="@max-[12rem]:sr-only">{word.join(" ")}</span>
    </span>
  );
}

/**
 * A Discover card in the v2 style: a tall 3:4 image, with the counts, the title, @creator and the tags on a dark fade at the
 * bottom of the image, with two lines of the bio preview. The whole card links to the character page. `statusBadge` shows a label next to the title, such as
 * "Draft". The text sits on its own layer above the image.
 * `linked={false}` shows the card with no link, for the form preview.
 */
export function CharacterCard({ card, statusBadge, linked = true }: { card: Card; statusBadge?: ReactNode; linked?: boolean }) {
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
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-[14px] bg-[linear-gradient(0deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.6)_30%,rgba(0,0,0,0)_58%)]" aria-hidden="true" />
      <span className="absolute inset-x-3 bottom-3 flex flex-col gap-[3px]">
        <span className="flex gap-3 text-xs text-[#e4e4e7]">
          <Count
            label={chatsLabel(card.chatCount)}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              </svg>
            }
          />
          <Count label={likesLabel(card.likeCount)} icon={<HeartIcon size={12} />} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base leading-[1.25] font-bold">{card.title}</span>
          {statusBadge && (
            <span className="rounded-full bg-[rgba(10,10,12,0.72)] px-2 py-px text-[11px] font-semibold whitespace-nowrap text-muted">{statusBadge}</span>
          )}
        </span>
        {card.bioPreview && <span className="line-clamp-2 text-[12.5px] leading-[1.45] text-[#d4d4d8]">{card.bioPreview}</span>}
        <span className="truncate text-[11.5px] text-[#a1a1aa]">@{card.creatorHandle}</span>
        {card.tags.length > 0 && (
          <span className="mt-[5px] flex flex-wrap gap-[5px]">
            {card.tags.slice(0, 3).map((tag) => (
              <span key={tag.slug} className="inline-flex h-5 items-center rounded-full bg-white/15 px-2 text-[11px] tracking-[0.02em] text-[#e4e4e7]">
                {tag.label}
              </span>
            ))}
          </span>
        )}
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
