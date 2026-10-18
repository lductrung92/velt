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

// Vietnamese, like the visitor-facing chat lines in the backend. A service
// worker cannot read the console's language setting — it has no page to ask
// and no access to its storage — so it uses the product's primary language
// rather than guessing.
//
// One entry per kind the server can send. An unknown kind falls back to the
// first entry rather than being dropped: a server that learns a new kind
// before a browser updates its worker should still interrupt somebody.
// Bumped whenever the behaviour here changes.
//
// A service worker is cached by the browser and keeps running after the file
// on the server has moved on, so "did my change reach this machine" is a real
// question with no obvious answer. The page can ask: see the message handler
// at the bottom. Without this, a stale worker silently dropping a new kind
// looks exactly like a server that never sent one.
const VERSION = "2026-10-18.4-kinds";

const KINDS = {
  visitor_waiting: {
    title: "Khách đang chờ tư vấn",
    body: "Có khách cần gặp người phụ trách. Bấm để mở hộp thoại.",
    path: "/chat",
  },
  chat_message: {
    title: "Khách vừa nhắn tin",
    body: "Có khách mở cuộc trò chuyện mới. Bấm để xem.",
    path: "/chat",
  },
  lead_new: {
    title: "Có khách để lại liên hệ",
    body: "Form liên hệ vừa được gửi. Bấm để xem danh sách khách.",
    path: "/leads",
  },
  newsletter_new: {
    title: "Có người đăng ký nhận tin",
    body: "Một địa chỉ mới vừa đăng ký. Bấm để xem danh sách.",
    path: "/leads?tab=newsletter",
  },
};

const FALLBACK = KINDS.visitor_waiting;

// Where a click lands. A conversation opens on its own thread because the
// inbox reads the id off the URL; the other kinds open their list, because
// nothing there reads a record id and a parameter no screen consumes is a
// link that silently does nothing.
function targetFor(kind, data) {
  const base = (KINDS[kind] || FALLBACK).path;
  if (data.conversation_id)
    return `${base}?conversation=${encodeURIComponent(data.conversation_id)}`;
  return base;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

// Answers "which version of me is actually running".
//   navigator.serviceWorker.controller.postMessage({type:"version"})
// with a MessageChannel, or just read the console line each push logs.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "version" && event.ports[0])
    event.ports[0].postMessage({ version: VERSION, kinds: Object.keys(KINDS) });
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A payload we cannot read is still a reason to look: show the generic
    // notification rather than swallowing the event.
  }
  const kind = data.kind || "visitor_waiting";
  const copy = KINDS[kind] || FALLBACK;
  // Logged so "the push arrived but nothing appeared" can be told apart from
  // "no push arrived". The first is a display problem on the machine — Focus
  // Assist, Windows notification settings — and the second is ours. Visible
  // under DevTools → Application → Service Workers → inspect.
  console.log(`[push-sw ${VERSION}] kind=${kind} -> ${copy.title}`);

  event.waitUntil(
    self.registration.showNotification(copy.title, {
      body: copy.body,
      icon: "/web-app-manifest-192x192.png",
      badge: "/favicon-96x96.png",
      // Collapses repeats for the same thing into one entry instead of
      // stacking them while nobody is looking. Keyed by kind as well as id,
      // so a lead does not replace a waiting visitor.
      tag: `${kind}:${data.conversation_id || data.entity_id || ""}`,
      renotify: true,
      // Only the one with a person on the other end stays on screen until it
      // is dealt with. A sign-up that nails itself to the corner of somebody's
      // display all afternoon is how notifications get switched off.
      requireInteraction: kind === "visitor_waiting",
      data: { url: targetFor(kind, data) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path =
    (event.notification.data && event.notification.data.url) || "/chat";
  const target = new URL(path, self.location.origin).href;

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
