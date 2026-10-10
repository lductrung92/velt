// Only honor same-origin relative paths for post-login redirect — blocks
// open-redirect (//evil.com, http://…, javascript:). docs/screens/auth-login
// /workflows.md §4.
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return "/";
  // Reject backslashes — some browsers normalize "\" → "/", so "/\evil.com"
  // could become protocol-relative.
  if (raw.includes("\\")) return "/";
  // Must start with a single "/" and not "//" (protocol-relative).
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  // Reject any scheme-y payload that slipped through.
  if (/^\/?\s*[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  return raw;
}
