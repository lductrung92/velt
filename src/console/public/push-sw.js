// Desktop notifications for the people on chat duty.
//
// This runs with no page open — that is the whole point. A visitor who asks
// for a human at 21:00 reaches nobody while the console only learns about
// messages from a polling tab, so the server pushes here instead.
//
// What arrives is deliberately thin: a kind and a conversation id, never the
// visitor's words. A push payload passes through a third party's push service
// and lands on a lock screen, so the text below is generic and the console
// fetches the conversation itself, authenticated, once somebody clicks.

const INBOX_PATH = "/chat";

// Vietnamese, like the visitor-facing chat lines in the backend. A service
// worker cannot read the console's language setting — it has no page to ask
// and no access to its storage — so it uses the product's primary language
// rather than guessing.
const TITLE = "Khách đang chờ tư vấn";
const BODY = "Có khách cần gặp người phụ trách. Bấm để mở hộp thoại.";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A payload we cannot read is still a reason to look: show the generic
    // notification rather than swallowing the event.
  }
  if (data.kind && data.kind !== "visitor_waiting") return;

  event.waitUntil(
    self.registration.showNotification(TITLE, {
      body: BODY,
      icon: "/web-app-manifest-192x192.png",
      badge: "/favicon-96x96.png",
      // Collapses repeats for the same conversation into one entry instead of
      // stacking them while nobody is looking.
      tag: data.conversation_id || "visitor-waiting",
      renotify: true,
      requireInteraction: true,
      data: { conversationId: data.conversation_id || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(INBOX_PATH, self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Reuse a console window if one is open: a second tab of the same app is
      // never what somebody wanted from a notification.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (!client.url.startsWith(self.location.origin)) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
