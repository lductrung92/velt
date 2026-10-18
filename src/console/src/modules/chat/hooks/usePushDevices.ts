import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { notifyService } from "../services/notify.service";

const SW_PATH = "/push-sw.js";

export const pushKeys = {
  devices: ["chat", "push-devices"] as const,
};

/** Whether this browser can do Web Push at all. Safari on iOS only can once
 *  the console is installed to the home screen, and the check below is what
 *  tells the two cases apart. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The VAPID key arrives base64url; subscribe() wants bytes.
 *
 *  Built over an explicit ArrayBuffer so the result is Uint8Array<ArrayBuffer>
 *  rather than Uint8Array<ArrayBufferLike>: applicationServerKey is typed as
 *  BufferSource, which a SharedArrayBuffer-backed view does not satisfy. */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(
    base64url.length + ((4 - (base64url.length % 4)) % 4),
    "=",
  );
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** A name a person can recognise in a device list. The user agent is the only
 *  thing a browser will tell us, so it is read for the two parts that actually
 *  distinguish one machine from another. */
function describeBrowser(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Trình duyệt";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Macintosh|Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

/** The subscription this browser already holds, if any. Read from the browser
 *  rather than from the device list: the server knows a row exists, only the
 *  browser knows whether it is this one. */
async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

export function usePushDevices() {
  const qc = useQueryClient();
  const [permission, setPermission] = useState<NotificationPermission | null>(
    pushSupported() ? Notification.permission : null,
  );

  const devices = useQuery({
    queryKey: pushKeys.devices,
    queryFn: () => notifyService.devices(),
    enabled: pushSupported(),
  });

  const thisEndpoint = useQuery({
    queryKey: [...pushKeys.devices, "current"],
    queryFn: currentEndpoint,
    enabled: pushSupported(),
  });

  const enable = useMutation({
    mutationFn: async () => {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") throw new Error("denied");

      const reg = await navigator.serviceWorker.register(SW_PATH);
      // register() on an EXISTING registration hands back the old worker and
      // schedules an update check whenever the browser feels like it. Until
      // that lands, pushes are handled by whatever version was installed the
      // first time — a worker that does not know about a kind added since
      // drops it in silence, which looks exactly like a server that never
      // sent anything. Asking for the check here makes "turn it on again"
      // the fix a person would reach for anyway.
      await reg.update().catch(() => {
        // Offline, or the browser declined to re-check. The existing worker
        // still works for the kinds it knows; nothing is worse for trying.
      });
      // register() resolves before the worker can receive anything; pushing to
      // a subscription whose worker is still installing drops the message.
      await navigator.serviceWorker.ready;

      const key = await notifyService.publicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(key),
      });
      const json = sub.toJSON();
      await notifyService.subscribe({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        label: describeBrowser(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pushKeys.devices }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const mine =
        devices.data?.find((d) => d.id === id)?.endpoint === thisEndpoint.data;
      await notifyService.remove(id);
      // Turning THIS browser off has to drop the browser's own subscription
      // too, or the push service keeps it alive and a later re-subscribe
      // silently re-creates the row nobody asked for.
      if (mine) {
        const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pushKeys.devices }),
  });

  const refreshEndpoint = useCallback(
    () => qc.invalidateQueries({ queryKey: pushKeys.devices }),
    [qc],
  );

  return {
    supported: pushSupported(),
    permission,
    devices,
    enable,
    remove,
    thisEndpoint: thisEndpoint.data ?? null,
    refreshEndpoint,
  };
}
