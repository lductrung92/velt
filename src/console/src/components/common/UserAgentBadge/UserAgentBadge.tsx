import { Globe } from "lucide-react";

// Lightweight client-side user-agent parse → "Chrome · Windows" (proper nouns,
// not translated). Defensive: unknown UA still renders without breaking layout.
function parseUserAgent(ua: string): string {
  let browser = "Unknown";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";

  let os = "Unknown";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod|ios/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return `${browser} · ${os}`;
}

export function UserAgentBadge({ ua }: { ua: string | null }) {
  if (!ua) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm" title={ua}>
      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
      {parseUserAgent(ua)}
    </span>
  );
}
