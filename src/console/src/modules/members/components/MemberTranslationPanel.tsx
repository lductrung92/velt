import { Lock, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { TranslatedField } from "@/modules/translation/components/TranslatedField";
import type { EntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";

interface Props {
  tr: EntityTranslation;
  readOnly?: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * The member profile for a non-source language.
 *
 * It reuses the same grid areas as the Vietnamese form, so switching language
 * moves nothing on screen. Only the two fields the server declares translatable
 * appear: a name, a photo and a contact address read the same in every language,
 * and showing them here would suggest otherwise.
 */
export function MemberTranslationPanel({ tr, readOnly }: Props) {
  const { t } = useTranslation();
  // Every label here is rendered in the language being written, not in the
  // console's own. Typing English into boxes labelled in Vietnamese is exactly
  // how a translator ends up filling the wrong one.
  const tl = (key: string) => t(key, { lng: tr.locale });

  return (
    <div className="editor-grid">
      <Card className="editor-main editor-card">
        <CardHeader className="editor-heading">
          <CardTitle>
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            {tl("members.section.basics")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <TranslatedField id="tr-member-role" label={tl("members.field.role")}>
            <TextField
              id="tr-member-role"
              value={str(tr.values.role)}
              maxLength={160}
              disabled={readOnly}
              onChange={(e) => tr.setField("role", e.target.value)}
            />
          </TranslatedField>

          <TranslatedField id="tr-member-bio" label={tl("members.field.bio")}>
            <Textarea
              id="tr-member-bio"
              rows={6}
              value={str(tr.values.bio)}
              disabled={readOnly}
              onChange={(e) => tr.setField("bio", e.target.value)}
            />
          </TranslatedField>
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
              <li>{tl("members.field.full_name")}</li>
              <li>{tl("members.photo")}</li>
              <li>{tl("members.field.skills")}</li>
              <li>{tl("members.section.contact")}</li>
              <li>{tl("members.active")}</li>
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
