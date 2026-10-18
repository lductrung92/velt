import api from "@/services/api";

// Mirrors backend/internal/modules/notify. Everything here needs
// ai.chat.handle: these are the devices of somebody on chat duty.

export interface PushDevice {
  id: string;
  /** Only the browser it belongs to can match this; it is how the list marks
   *  "this device". */
  endpoint: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export interface PushTestResult {
  id: string;
  label: string;
  /** ok = a push service took it · gone = subscription dead, row removed ·
   *  failed = the push service refused or could not be reached. */
  status: "ok" | "gone" | "failed";
}

export interface PushTestResponse {
  /** Browsers a push service accepted the message for — NOT notifications
   *  anybody saw. What the machine does after that is not observable from
   *  the server. */
  accepted: number;
  devices: PushTestResult[];
}

export const notifyService = {
  /** The server's VAPID public key, minted on first request. */
  async publicKey(): Promise<string> {
    const { data } = await api.get<{ public_key: string }>("/notify/push/key");
    return data.public_key;
  },

  async devices(): Promise<PushDevice[]> {
    const { data } = await api.get<{ items: PushDevice[] }>(
      "/notify/push/devices",
    );
    return data.items;
  },

  async subscribe(body: {
    endpoint: string;
    p256dh: string;
    auth: string;
    label: string;
  }): Promise<void> {
    await api.post("/notify/push/devices", body);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/notify/push/devices/${id}`);
  },

  /** Pushes a test notification to this account's own browsers. */
  async test(): Promise<PushTestResponse> {
    const { data } = await api.post<PushTestResponse>("/notify/push/test");
    return data;
  },
};
