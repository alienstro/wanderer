import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "@/components/ui/share-button";

/** The blurred image of the character that glows at the top of the chat, as in the v2 design. */
export function ChatGlow({ src }: { src: string | null }) {
  return (
    <>
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -top-[20%] -left-[10%] -z-10 h-[70%] w-[120%] object-cover opacity-35 blur-[48px] saturate-[1.2]"
        />
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(11,11,13,0.2)_0%,#0b0b0d_55%)]" />
    </>
  );
}

export interface ChatIntroProps {
  name: string;
  src: string | null;
  /** The title of the chat. It is the heading of the page. */
  title: string;
  characterId: string;
  personaName: string | null;
}

/** The character at the start of the messages: the avatar, the title of the chat, the character page link, the persona, and a Share button. */
export function ChatIntro({ name, src, title, characterId, personaName }: ChatIntroProps) {
  return (
    <header className="flex flex-col items-center gap-1.5 pb-2 text-center">
      <Avatar name={name} src={src} size={64} />
      <h1 className="m-0 mt-1 text-[19px] font-extrabold tracking-[-0.01em]">{title}</h1>
      <div className="text-xs text-muted">
        <Link href={`/characters/${characterId}`} className="text-link no-underline">
          Character page
        </Link>
        {personaName && (
          <span>
            {" · You play as "}
            <strong className="text-text">{personaName}</strong>
          </span>
        )}
      </div>
      <span className="mt-1.5">
        <ShareButton title={name} path={`/characters/${characterId}`} small />
      </span>
    </header>
  );
}
