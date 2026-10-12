import { Languages, Lock, PenLine, Search } from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { SlugField } from "@/components/common/SlugField";
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
 * Only two things still need them: the body, shown beside its translation, and
 * the search preview, which walks the same fallback chain the published page
 * will — an untranslated SEO field serves the Vietnamese one, so the preview has
 * to show that rather than a blank.
 */
export interface ArticleSource {
  title: string;
  slug: string;
  excerpt: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
}

interface Props {
  tr: EntityTranslation;
  source: ArticleSource;
  readOnly?: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * The editor body for a non-source language.
 *
 * It reuses the same three grid areas as the Vietnamese form — content, side
 * settings, SEO — so switching language moves nothing on screen. Only the
 * fields that may be translated appear: showing cover image or category here
 * would imply they vary by language, and they do not.
 */
export function ArticleTranslationPanel({ tr, source, readOnly }: Props) {
  const { t } = useTranslation();
  // Every label in this panel is rendered in the language being written, not in
  // the console's own language. Writing English into boxes labelled in
  // Vietnamese is exactly how a translator ends up typing in the wrong one.
  const tl = (key: string) => t(key, { lng: tr.locale });
  const seo = (tr.values.seo ?? {}) as Record<string, unknown>;
  const setSeo = (key: string, value: string) =>
    tr.setField("seo", { ...seo, [key]: value });

  return (
    <div className="article-editor-grid">
      <Card
        className="article-editor-content article-editor-card"
        id="art-translation"
      >
        <CardHeader className="article-editor-heading">
          <CardTitle>
            <PenLine className="size-4 text-muted-foreground" aria-hidden />
            {tl("cms.articles.editor.content")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Same class the Vietnamese form gives its title, so switching
              language does not resize the field under the cursor. */}
          <div className="article-editor-titleblock space-y-2">
            <TranslatedField
              id="tr-article-title"
              className="article-editor-title"
              label={tl("cms.articles.field.title")}
            >
              <TextField
                id="tr-article-title"
                value={str(tr.values.title)}
                disabled={readOnly}
                maxLength={255}
                onChange={(e) => tr.setField("title", e.target.value)}
              />
            </TranslatedField>

            {/* Same row, same place as the source form: a translator should not
              have to learn a second layout to change a URL. Left empty, the
              page keeps the source language's address. */}
            <div>
              <SlugField
                label={tl("cms.articles.editor.permalink")}
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
            id="tr-article-excerpt"
            label={tl("cms.articles.field.excerpt")}
          >
            <Textarea
              id="tr-article-excerpt"
              rows={3}
              maxLength={500}
              value={str(tr.values.excerpt)}
              disabled={readOnly}
              onChange={(e) => tr.setField("excerpt", e.target.value)}
            />
          </TranslatedField>

          <div>
            {/* Two headings on one row so each column is labelled: the editor on
                the left, the Vietnamese it is being translated from on the
                right. */}
            <div className="tr-body-heads">
              <p className="text-sm font-medium leading-none">
                {tl("cms.articles.field.body")}
              </p>
              <span className="tr-caption">{tl("tr.source")}</span>
            </div>
            <div className="tr-body">
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <RichTextEditor
                  value={str(tr.values.body_html)}
                  editable={!readOnly}
                  ariaLabel={tl("cms.articles.field.body")}
                  className="article-editor-body"
                  onChange={(html) => tr.setField("body_html", html)}
                />
              </Suspense>
              <div
                className="tr-body-source"
                // The source body is the editor's own sanitised output, read
                // back for reference only.
                dangerouslySetInnerHTML={{
                  __html: source.bodyHtml || `<p>${tl("tr.source_empty")}</p>`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <aside className="article-editor-settings space-y-5">
        <Card className="article-editor-card">
          <CardHeader className="article-editor-heading">
            <CardTitle>
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              {tl("tr.shared_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="tr-shared">
              <li>{tl("cms.articles.field.status")}</li>
              <li>{tl("cms.articles.field.featured")}</li>
              <li>{tl("cms.articles.field.category")}</li>
              <li>{tl("cms.tags.title")}</li>
            </ul>
          </CardContent>
        </Card>
      </aside>

      <Card className="article-editor-seo article-editor-card">
        <CardHeader className="article-editor-heading">
          <CardTitle>
            <Search className="size-4 text-muted-foreground" aria-hidden />
            {tl("cms.articles.editor.seo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="article-editor-search-preview">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Languages className="size-3.5" aria-hidden />
              {tl("cms.articles.editor.search_preview")}
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
                str(tr.values.title) ||
                source.title}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
              {str(seo.description) ||
                source.seoDescription ||
                str(tr.values.excerpt) ||
                source.excerpt}
            </p>
          </div>

          <TranslatedField
            id="tr-article-seo-title"
            label={tl("cms.articles.seo.title")}
          >
            <TextField
              id="tr-article-seo-title"
              value={str(seo.title)}
              disabled={readOnly}
              maxLength={255}
              onChange={(e) => setSeo("title", e.target.value)}
            />
          </TranslatedField>

          <TranslatedField
            id="tr-article-seo-desc"
            label={tl("cms.articles.seo.description")}
          >
            <Textarea
              id="tr-article-seo-desc"
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
