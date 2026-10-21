const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** The status label that the creator sees: Draft, Hidden, Private, or Published. */
export function statusLabel(card: { status: "draft" | "published" | "hidden"; isPublic: boolean }): string {
  if (card.status === "draft") return "Draft";
  if (card.status === "hidden") return "Hidden";
  return card.isPublic ? "Published" : "Private";
}

/** "1 chat", "12 chats", "1.2K chats". */
export function chatsLabel(count: number): string {
  return `${compact.format(count)} ${count === 1 ? "chat" : "chats"}`;
}
