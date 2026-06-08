const STORAGE_PREFIX = "hermes-chat-";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function getStorageKey(agentId: string): string {
  return `${STORAGE_PREFIX}${agentId}`;
}

export function loadChatHistory(agentId: string): ChatMessage[] {
  try {
    const stored = localStorage.getItem(getStorageKey(agentId));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) return parsed as ChatMessage[];
    return [];
  } catch {
    return [];
  }
}

export function saveChatHistory(
  agentId: string,
  messages: ChatMessage[],
): void {
  try {
    localStorage.setItem(getStorageKey(agentId), JSON.stringify(messages));
  } catch (e) {
    console.warn("[hermes-chat] Failed to save chat history:", e);
  }
}

export function clearChatHistory(agentId: string): void {
  try {
    localStorage.removeItem(getStorageKey(agentId));
  } catch (e) {
    console.warn("[hermes-chat] Failed to clear chat history:", e);
  }
}

/**
 * Send messages to Hermes /v1/chat/completions and store conversation locally.
 *
 * @param messages - Array of messages in OpenAI format.
 * @param agentId - Agent identifier used as localStorage key.
 * @returns The assistant response text.
 */
export async function chatWithAgent(
  messages: ChatMessage[],
  agentId: string,
): Promise<string> {
  const response = await fetch("/api/hermes/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "AIO", messages }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Hermes API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  // Store conversation including the assistant response
  const updatedMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content },
  ];
  saveChatHistory(agentId, updatedMessages);

  return content;
}
