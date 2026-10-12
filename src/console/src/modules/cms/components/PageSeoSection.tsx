import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { PageSEO } from "../services/pages.service";

// SEO editor for a CMS page. The backend replaces the whole `seo` object on
// save, so the editor always holds all 8 fields and the payload is normalized
// (trimmed text → null) via normalizeSeo.

export const EMPTY_SEO: PageSEO = {
  title: null,
  description: null,
  keywords: null,
  canonical_url: null,
  noindex: false,
  nofollow: false,
  og_title: null,
  og_description: null,
};

export function normalizeSeo(seo: PageSEO): PageSEO {
  const s = (v?: string | null) => (v ?? "").trim() || null;
  return {
    title: s(seo.title),
    description: s(seo.description),
    keywords: s(seo.keywords),
    canonical_url: s(seo.canonical_url),
    noindex: !!seo.noindex,
    nofollow: !!seo.nofollow,
    og_title: s(seo.og_title),
    og_description: s(seo.og_description),
  };
}

// normalizeSeo emits keys in a fixed order, so JSON compare is stable.
export function seoEquals(a: PageSEO, b: PageSEO): boolean {
  return JSON.stringify(normalizeSeo(a)) === JSON.stringify(normalizeSeo(b));
}

// Field plan mirrors the article editor's SEO card 1:1 (same order, controls and
// max lengths) so both CMS editors read identically. State-driven (this form's
// seo lives outside react-hook-form), but the markup matches FormItem spacing.
const TEXT_ROWS = [
  { key: "title", max: 255, multiline: false },
  { key: "description", max: 500, multiline: true },
  { key: "keywords", max: 255, multiline: false },
  { key: "canonical_url", max: 500, multiline: false },
] as const;
const OG_ROWS = [
  { key: "og_title", max: 255, multiline: false },
  { key: "og_description", max: 500, multiline: true },
] as const;
const FLAG_FIELDS = ["noindex", "nofollow"] as const;

export function PageSeoSection({
  id = "page-seo",
  value,
  onChange,
}: {
  /** Anchor the section nav scrolls to; each editor uses its own. */
  id?: string;
  value: PageSEO;
  onChange: (next: PageSEO) => void;
}) {
  const { t } = useTranslation();

  const textRow = ({
    key,
    max,
    multiline,
  }: {
    key: (typeof TEXT_ROWS | typeof OG_ROWS)[number]["key"];
    max: number;
    multiline: boolean;
  }) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`cms-page-seo-${key}`}>{t(`cms.pages.seo.${key}`)}</Label>
      {multiline ? (
        <Textarea
          id={`cms-page-seo-${key}`}
          rows={2}
          maxLength={max}
          value={value[key] ?? ""}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      ) : (
        <Input
          id={`cms-page-seo-${key}`}
          type={key === "canonical_url" ? "url" : "text"}
          maxLength={max}
          value={value[key] ?? ""}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      )}
    </div>
  );

  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle>{t("cms.pages.seo.heading")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {TEXT_ROWS.map(textRow)}
        <div className="flex flex-wrap items-center gap-5">
          {FLAG_FIELDS.map((f) => (
            <Checkbox
              key={f}
              id={`cms-page-seo-${f}`}
              label={t(`cms.pages.seo.${f}`)}
              checked={value[f]}
              onChange={(e) => onChange({ ...value, [f]: e.target.checked })}
            />
          ))}
        </div>
        {OG_ROWS.map(textRow)}
      </CardContent>
    </Card>
  );
}
