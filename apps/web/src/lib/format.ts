const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** "1 chat", "12 chats", "1.2K chats". */
export function chatsLabel(count: number): string {
  return `${compact.format(count)} ${count === 1 ? "chat" : "chats"}`;
}
