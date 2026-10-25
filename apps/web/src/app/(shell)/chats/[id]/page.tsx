import { ChatView } from "@/features/chats";

/** The chat page. It needs a login, so the browser loads the chat with the session cookie. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatView chatId={id} />;
}
