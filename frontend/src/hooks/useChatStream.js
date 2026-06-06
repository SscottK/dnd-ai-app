import { useState } from "react";
import { API_BASE_URL } from "../lib/api";

export function useChatStream(token) {
  const [isStreaming, setIsStreaming] = useState(false);

  const streamMessage = async (conversationId, content, callbacks) => {
    if (!token) {
      callbacks.onError(new Error("No active credentials."));
      return;
    }

    setIsStreaming(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned error status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) {
        throw new Error("Response body is not readable.");
      }

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const rawJson = trimmed.slice(6);
          try {
            const parsed = JSON.parse(rawJson);

            if (parsed.chunk) {
              callbacks.onChunk(parsed.chunk);
            } else if (parsed.status === "DONE" && parsed.message) {
              callbacks.onDone(parsed.message);
            }
          } catch (e) {
            console.error("Error parsing SSE chunk JSON:", e);
          }
        }
      }
    } catch (error) {
      callbacks.onError(error);
    } finally {
      setIsStreaming(false);
    }
  };

  return {
    streamMessage,
    isStreaming,
  };
}
