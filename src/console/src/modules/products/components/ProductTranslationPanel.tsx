import { Languages, Lock, PenLine, Search } from "lucide-react";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";

import { SlugField } from "@/components/common/SlugField";
import { StringListField } from "@/components/common/StringListField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { TranslatedField } from "@/modules/translation/components/TranslatedField";
import type { EntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";

const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({
    default: m.RichTextEditor,
  })),
);

/**
 * The source-language values the translator is working from.
 *
 * Only two things still need them: the description, shown beside its
 * translation, and the search preview, which walks the same fallback chain the
 * published page will — an untranslated SEO field serves the Vietnamese one, so
 * the preview has to show that rather than a blank.
 */
export interface ProductSource {
  name: string;
  slug: string;
  summary: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
}

interface Props {
  tr: EntityTranslation;
  source: ProductSource;
  readOnly?: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

/**
 * The editor body for a non-source language.
 *
 * It reuses the same three grid areas as the Vietnamese form — content, side
 * settings, SEO — so switching language moves nothing on screen. Only the
 * fields that may be translated appear: showing the cover, the lifecycle or the
 * team here would imply they vary by language, and they do not.
 */
export function ProductTranslationPanel({ tr, source, readOnly }: Props) {
  const { t } = useTranslation();
  // Every label in this panel is rendered in the language being written, not in
  // the console's own language. Writing English into boxes labelled in
  // Vietnamese is exactly how a translator ends up typing in the wrong one.
  const tl = (key: string) => t(key, { lng: tr.locale });
  const seo = (tr.values.seo ?? {}) as Record<string, unknown>;
  const setSeo = (key: string, value: string) =>
    tr.setField("seo", { ...seo, [key]: value });

  return (
    <div className="editor-grid">
      <Card className="editor-main editor-card" id="prod-translation">
        <CardHeader className="editor-heading">
          <CardTitle>
            <PenLine className="size-4 text-muted-foreground" aria-hidden />
            {tl("products.editor.content")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Same class the Vietnamese form gives its name, so switching
              language does not resize the field under the cursor. */}
          <div className="editor-titleblock space-y-2">
            <TranslatedField
              id="tr-product-name"
              className="editor-title"
              label={tl("products.col.name")}
            >
              <TextField
                id="tr-product-name"
                value={str(tr.values.name)}
                disabled={readOnly}
                maxLength={200}
                onChange={(e) => tr.setField("name", e.target.value)}
              />
            </TranslatedField>

            {/* Same row, same place as the source form: a translator should not
                have to learn a second layout to change a URL. Left empty, the
                page keeps the source language's address. */}
            <div>
              <SlugField
                label={tl("products.editor.permalink")}
                value={str(tr.values.slug)}
                original={str(tr.values.slug)}
                emptyValue={source.slug}
                locale={tr.locale}
                disabled={readOnly}
                onChange={(v) => tr.setField("slug", v)}
              />
              {/* Only while there is nothing here: once a slug is set, the hint
                  describes a state the record is no longer in. */}
              {!str(tr.values.slug) && (
                <p className="tr-caption mt-1.5">{tl("tr.slug_hint")}</p>
              )}
            </div>
          </div>

          <TranslatedField
            id="tr-product-summary"
            label={tl("products.field.summary")}
          >
            <Textarea
              id="tr-product-summary"
              rows={2}
              maxLength={500}
              value={str(tr.values.summary)}
              disabled={readOnly}
              onChange={(e) => tr.setField("summary", e.target.value)}
            />
          </TranslatedField>

          {/* Declared translatable because a highlight is a sentence a reader
              reads, not a key: left in Vietnamese it would be the one scrap of
              the other language on an English page. */}
          <TranslatedField
            id="tr-product-highlights"
            label={tl("products.field.highlights")}
          >
            <StringListField
              id="tr-product-highlights"
              // Its own placeholder would come out in the console's language,
              // which is the one thing this panel does not do.
              placeholder={tl("common.string_list.placeholder")}
              value={list(tr.values.highlights)}
              maxLength={300}
              disabled={readOnly}
              onChange={(next) => tr.setField("highlights", next)}
            />
          </TranslatedField>

          <div>
            {/* Two headings on one row so each column is labelled: the editor on
                the left, the Vietnamese it is being translated from on the
                right. */}
            <div className="tr-body-heads">
              <p className="text-sm font-medium leading-none">
                {tl("products.field.body")}
              </p>
              <span className="tr-caption">{tl("tr.source")}</span>
            </div>
            <div className="tr-body">
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <RichTextEditor
                  value={str(tr.values.body_html)}
                  editable={!readOnly}
                  ariaLabel={tl("products.field.body")}
                  className="editor-body"
                  onChange={(html) => tr.setField("body_html", html)}
                />
              </Suspense>
              <div
                className="tr-body-source"
                // The source description is the editor's own sanitised output,
                // read back for reference only.
                dangerouslySetInnerHTML={{
                  __html: source.bodyHtml || `<p>${tl("tr.source_empty")}</p>`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <aside className="editor-side space-y-5">
        <Card className="editor-card">
          <CardHeader className="editor-heading">
            <CardTitle>
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              {tl("tr.shared_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="tr-shared">
              <li>{tl("products.col.lifecycle")}</li>
              <li>{tl("products.field.cover")}</li>
              <li>{tl("products.editor.gallery")}</li>
              <li>{tl("products.field.categories")}</li>
              <li>{tl("products.field.members")}</li>
            </ul>
          </CardContent>
        </Card>
      </aside>

      <Card className="editor-wide editor-card">
        <CardHeader className="editor-heading">
          <CardTitle>
            <Search className="size-4 text-muted-foreground" aria-hidden />
            {tl("products.editor.seo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="editor-seo-preview">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Languages className="size-3.5" aria-hidden />
              {tl("products.editor.search_preview")}
            </p>
            <span className="text-xs font-medium text-muted-foreground">
              {"Zukatek"}
            </span>
            {/* The preview applies the same fallback the public page will: an
                untranslated field quietly serves the Vietnamese one, and this is
                where the translator sees that happen. */}
            <p className="mt-1 break-words text-lg font-medium text-primary">
              {str(seo.title) ||
                source.seoTitle ||
                str(tr.values.name) ||
                source.name}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
              {str(seo.description) ||
                source.seoDescription ||
                str(tr.values.summary) ||
                source.summary}
            </p>
          </div>

          <TranslatedField
            id="tr-product-seo-title"
            label={tl("cms.pages.seo.title")}
          >
            <TextField
              id="tr-product-seo-title"
              value={str(seo.title)}
              disabled={readOnly}
              maxLength={255}
              onChange={(e) => setSeo("title", e.target.value)}
            />
          </TranslatedField>

          <TranslatedField
            id="tr-product-seo-desc"
            label={tl("cms.pages.seo.description")}
          >
            <Textarea
              id="tr-product-seo-desc"
              rows={3}
              maxLength={500}
              value={str(seo.description)}
              disabled={readOnly}
              onChange={(e) => setSeo("description", e.target.value)}
            />
          </TranslatedField>
        </CardContent>
      </Card>
    </div>
  );
}
