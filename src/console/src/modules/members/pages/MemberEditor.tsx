import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ImageIcon,
  Mail,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar";
import {
  ImageUpload,
  type ImageUploadValue,
} from "@/components/common/ImageHandler";
import { PageHeader } from "@/components/common/PageHeader";
import { SlugField } from "@/components/common/SlugField";
import { StringListField } from "@/components/common/StringListField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChanges } from "@/app/UnsavedChangesProvider";
import { usePermission } from "@/modules/auth";
import { LanguageTabs } from "@/modules/translation/components/LanguageTabs";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { parseApiError } from "@/utils/apiError";

import { MemberTranslationPanel } from "../components/MemberTranslationPanel";
import {
  useCreateMember,
  useDeleteMemberAvatar,
  useUploadMemberAvatar,
  useMember,
  useUpdateMember,
} from "../hooks/useMembers";
import {
  makeMemberSchema,
  memberFormDefaults,
  type MemberFormValues,
} from "../schemas/member";
import type { Member } from "../services/members.service";
import "@/styles/editor-page.css";
import "./member-editor.css";

const BACK = "/members";

// Create/edit a team member. The avatar is NOT part of the form — it has its own
// endpoint — but it is still picked here and held as a blob until Save, so a new
// member can be filled in completely in one pass.
export default function MemberEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== "new";

  const { hasPermission } = usePermission();
  const canManage = hasPermission("members.manage");

  const detail = useMember(isEdit ? id : undefined);
  const create = useCreateMember();
  const update = useUpdateMember();
  const removeAvatar = useDeleteMemberAvatar();
  const uploadAvatar = useUploadMemberAvatar();

  // The photo is held here until Save, so a new member can pick one before the
  // row exists.
  const [avatar, setAvatar] = useState<ImageUploadValue>({ kind: "empty" });
  const [avatarDirty, setAvatarDirty] = useState(false);

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(makeMemberSchema(t)),
    defaultValues: memberFormDefaults,
    mode: "onTouched",
  });
  const links = useFieldArray({ control: form.control, name: "links" });

  const member = detail.data;
  // Translations live outside this form: their shape is locale x declared field,
  // which a static zod schema cannot describe.
  const tr = useEntityTranslation("member", member?.id);

  useUnsavedChanges({
    when: form.formState.isDirty || avatarDirty || tr.dirty,
    what: t("members.one"),
  });

  useEffect(() => {
    if (!member) return;
    form.reset({
      full_name: member.full_name,
      slug: member.slug,
      role: member.role ?? "",
      bio: member.bio ?? "",
      email: member.email ?? "",
      zalo: member.zalo ?? "",
      skills: member.skills,
      links: member.links,
      is_active: member.is_active,
    });
    setAvatar(
      member.avatar_url
        ? { kind: "uploaded", fileId: "", url: member.avatar_url }
        : { kind: "empty" },
    );
    setAvatarDirty(false);
  }, [member, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    // An empty string means "clear this field"; the backend reads it the same
    // way, so the wire shape is just the trimmed form state.
    const body = {
      full_name: values.full_name,
      role: values.role,
      bio: values.bio,
      email: values.email,
      zalo: values.zalo,
      skills: values.skills,
      links: values.links,
      is_active: values.is_active,
    };

    const onError = (err: unknown) =>
      toast.error(parseApiError(err, t).message);

    if (isEdit && id) {
      try {
        // Before the member write, so one Save carries both: the record write is
        // what the rest of the app reacts to, and a translation stored after it
        // would wait for a second one.
        await tr.flush(id);
        // Only when it actually changed: a slug is an address people already
        // hold — in a referral link here — so sending the current one back on
        // every save would re-run the rename path for nothing.
        const nextSlug = values.slug.trim();
        const saved = await update.mutateAsync({
          id,
          body:
            nextSlug && nextSlug !== member?.slug
              ? { ...body, slug: nextSlug }
              : body,
        });
        await tr.refresh();
        await resolveAvatar(saved.id);
        setAvatarDirty(false);
        form.reset({ ...values, slug: saved.slug });
        toast.success(t("members.saved"));
      } catch (err) {
        onError(err);
      }
      return;
    }

    let created: Member;
    try {
      created = await create.mutateAsync(body);
    } catch (err) {
      onError(err);
      return;
    }
    // The member exists now; a failed photo must not read as "nothing saved".
    try {
      await resolveAvatar(created.id);
      toast.success(t("members.saved"));
    } catch (err) {
      onError(err);
    } finally {
      setAvatarDirty(false);
      form.reset(values);
      navigate(`/members/${created.id}`, { replace: true });
    }
  });

  // Applies whatever the user did to the photo, once there is a member to apply
  // it to. Untouched slots fall through and change nothing.
  const resolveAvatar = async (memberId: string) => {
    if (avatar.kind === "pending") {
      const file = new File([avatar.blob], "avatar", {
        type: avatar.blob.type,
      });
      await uploadAvatar.mutateAsync({ id: memberId, file });
      return;
    }
    if (avatar.kind === "empty" && member?.avatar_url) {
      await removeAvatar.mutateAsync(memberId);
    }
  };

  const saving = create.isPending || update.isPending;

  if (isEdit && detail.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (isEdit && detail.isError) {
    return (
      <Alert
        variant="danger"
        message={parseApiError(detail.error, t).message}
      />
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="editor-page space-y-5"
        data-editor="member"
      >
        <PageHeader
          title={isEdit ? t("members.edit_title") : t("members.create_title")}
          subtitle={t("members.editor_subtitle")}
          breadcrumbs={[
            { labelKey: "nav.members", to: BACK },
            {
              labelKey: isEdit ? "members.edit_title" : "members.create_title",
            },
          ]}
        />

        <EditorActionBar
          center={<LanguageTabs tr={tr} disabled={!isEdit} embedded />}
          left={
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(BACK)}
              disabled={saving}
            >
              <ArrowLeft className="size-4" />
              {t("common.back")}
            </Button>
          }
        >
          <Button type="submit" disabled={!canManage || saving}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>

        {!tr.isBase && <MemberTranslationPanel tr={tr} readOnly={!canManage} />}

        {/* The source-language form stays mounted while another language is on
            screen, so a half-filled profile survives a tab switch. */}
        <div className="editor-grid" hidden={!tr.isBase}>
          <Card className="editor-main editor-card">
            <CardHeader className="editor-heading">
              <CardTitle>
                <UserRound
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
                {t("members.section.basics")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="editor-titleblock space-y-2">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem className="editor-title">
                      <FormLabel required>
                        {t("members.field.full_name")}
                      </FormLabel>
                      <FormControl>
                        <TextField
                          maxLength={160}
                          disabled={!canManage}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Only after the first save: before that the server derives the
                    slug from the name, and an empty box would just invite a
                    worse answer. */}
                {isEdit && member && (
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <SlugField
                          label={t("members.field.permalink")}
                          value={field.value}
                          original={member.slug}
                          onChange={field.onChange}
                          disabled={!canManage}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("members.field.slug_help")}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("members.field.role")}</FormLabel>
                    <FormControl>
                      <TextField
                        maxLength={160}
                        disabled={!canManage}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("members.field.bio")}</FormLabel>
                    <FormControl>
                      <Textarea rows={4} disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="skills"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("members.field.skills")}</FormLabel>
                    <FormControl>
                      <StringListField
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!canManage}
                        placeholder={t("members.field.skills_ph")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <aside
            className="editor-side space-y-4"
            aria-label={t("members.photo")}
          >
            <Card className="editor-card">
              <CardHeader className="editor-heading">
                <CardTitle>
                  <ImageIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {t("members.photo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <ImageUpload
                  type="circle"
                  radius={64}
                  value={avatar}
                  onChange={(next) => {
                    setAvatar(next);
                    setAvatarDirty(true);
                  }}
                  disabled={!canManage}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex w-full items-center justify-between gap-3 border-t pt-4">
                      <div>
                        <FormLabel>{t("members.active")}</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          {t("members.active_help")}
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!canManage}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </aside>

          <Card className="editor-wide editor-card">
            <CardHeader className="editor-heading">
              <CardTitle>
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                {t("members.section.contact")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("members.field.email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          maxLength={255}
                          disabled={!canManage}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {t("members.field.email_help")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zalo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("members.field.zalo")}</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={500}
                          placeholder="https://zalo.me/..."
                          disabled={!canManage}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2 border-t pt-5">
                {/* A plain Label, not FormLabel: this heading labels the whole
                    repeater, so it lives outside any FormField context. */}
                <Label>{t("members.field.links")}</Label>
                {links.fields.map((row, i) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`links.${i}.label`}
                      render={({ field }) => (
                        <FormItem className="w-40 shrink-0">
                          <FormControl>
                            <Input
                              placeholder={t("members.field.link_label")}
                              disabled={!canManage}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`links.${i}.url`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              placeholder="https://..."
                              disabled={!canManage}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.remove")}
                      disabled={!canManage}
                      onClick={() => links.remove(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canManage || links.fields.length >= 20}
                  onClick={() => links.append({ label: "", url: "" })}
                >
                  <Plus className="size-4" />
                  {t("members.add_link")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
