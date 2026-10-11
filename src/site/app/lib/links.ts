import type { Member, Product, SiteContent } from "../types";

export function safeUrl(value = "") {
  if (!value.trim()) return "";
  try {
    const url = new URL(value, "http://site.local");
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.origin === "http://site.local"
      ? url.pathname + url.search + url.hash
      : url.href;
  } catch {
    return "";
  }
}
export function safeExternalUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function withReferral(path: string, ref?: Member) {
  const url = new URL(path, "http://site.local");
  if (ref) url.searchParams.set("ref", ref.id);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function demoLink(product: Product, ref?: Member) {
  const link = safeExternalUrl(product.demoUrl || product.url);
  if (!link) return "";
  const url = new URL(link);
  if (product.forwardReferral && ref) url.searchParams.set("ref", ref.id);
  return url.href;
}
export function contactFor(data: SiteContent, id = "") {
  const member = data.members.find((person) => person.id === id);
  const email = (value = "") =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
  const ownEmail = email(member?.email),
    ownZalo = safeExternalUrl(member?.zalo);
  return {
    member,
    email: ownEmail || email(data.email),
    zalo: ownZalo || safeExternalUrl(data.zalo),
    personal: !!(ownEmail || ownZalo),
  };
}
