import { useAuthStore } from "@/store/auth.store";

/** One event off the inbox stream. The server sends identifiers, never
 *  content: the console refetches, so what an operator may see stays decided
 *  by the authenticated read. */
export interface InboxEvent {
  type: string;
  conversation_id?: string;
}

/** Opens the inbox stream and calls `onEvent` for each event, until the
 *  returned function is called.
 *
 *  Why fetch and not EventSource: the console authenticates with a Bearer
 *  header and EventSource cannot send headers. The alternative — putting the
 *  access token in the query string — would write it into every access log and
 *  Referer along the way, which is not a trade worth making for less code.
 *
 *  Reconnects with a backoff, because a stream that dies silently is exactly
 *  the failure this replaces polling to avoid. */
export function openInboxStream(
  onEvent: (event: InboxEvent) => void,
): () => void {
  const controller = new AbortController();
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    while (!stopped) {
      try {
        const token = useAuthStore.getState().accessToken;
        if (!token) throw new Error("not signed in");

        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL as string}/chat/stream`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "text/event-stream",
            },
            credentials: "include",
            signal: controller.signal,
          },
        );
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

        attempt = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; a read can split one, so
          // the tail stays in the buffer until its terminator arrives.
          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const data = frame
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (data) {
              try {
                onEvent(JSON.parse(data.slice(5).trim()) as InboxEvent);
              } catch {
                // A frame we cannot parse is not worth tearing the stream down
                // for; the next one will do.
              }
            }
            split = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (stopped) return;
      }
      if (stopped) return;
      // Backoff, capped: a backend that is down must not be hammered by every
      // open console, and an operator must not wait minutes once it is back.
      attempt += 1;
      const wait = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, wait);
      });
    }
  };

  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller.abort();
  };
}
