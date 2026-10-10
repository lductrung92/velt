import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { TextField } from "@/components/ui/text-field";
import { usePermission } from "@/modules/auth";
import { useAuthStore } from "@/store/auth.store";
import { parseApiError } from "@/utils/apiError";

import { useRoles } from "../hooks/useAdminRoles";
import { useCreateUser, useUpdateUser } from "../hooks/useAdminUsers";
import {
  makeCreateUserSchema,
  makeEditUserSchema,
  type CreateUserValues,
  type EditUserValues,
} from "../schemas/admin";
import type { AdminUser } from "../services/admin.service";

const EDITOR_CODE = "editor";

interface RoleOption {
  value: string;
  label: string;
}

// Thin switch — only one of the two forms (each with a single useForm) is ever
// mounted, so there's no two-RHF-instances-in-one-component pitfall.
export function UserFormDialog({
  mode,
  user,
  onClose,
}: {
  mode: "create" | "edit";
  user?: AdminUser;
  onClose: () => void;
}) {
  if (mode === "edit" && user)
    return <EditUserForm user={user} onClose={onClose} />;
  return <CreateUserForm onClose={onClose} />;
}

// Role <Select> rendered only for super_admin (single role on console). Returns
// role options + whether the data is still loading.
function useRoleOptions(enabled: boolean): {
  options: RoleOption[];
  loading: boolean;
  editorId: string | undefined;
} {
  const roles = useRoles(enabled);
  const options = (roles.data ?? []).map((r) => ({
    value: r.id,
    label: r.name,
  }));
  const editorId = roles.data?.find((r) => r.code === EDITOR_CODE)?.id;
  return { options, loading: roles.isLoading, editorId };
}

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const isSuper = hasPermission("*");
  const { options: roleOptions, editorId } = useRoleOptions(isSuper);

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(makeCreateUserSchema(t)),
    defaultValues: { email: "", full_name: "", role_id: "" },
    mode: "onChange",
  });
  // Super_admin: preselect Editor once the role catalog loads.
  useEffect(() => {
    if (isSuper && editorId && !form.getValues("role_id")) {
      form.setValue("role_id", editorId);
    }
  }, [isSuper, editorId, form]);

  const create = useCreateUser();
  const [topError, setTopError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit((v) => {
    setTopError(null);
    create.mutate(
      {
        email: v.email.trim(),
        full_name: v.full_name.trim(),
        // Non-super: omit role → BE assigns editor. Super: send the chosen role.
        role_ids: isSuper && v.role_id ? [v.role_id] : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("admin.users.created"));
          onClose();
        },
        onError: (err) => {
          const p = parseApiError(err, t);
          if (p.key === "conflict") {
            form.setError("email", { message: t("errors.conflict") });
          } else if (p.code === 422 && p.fieldErrors.email) {
            form.setError("email", { message: p.fieldErrors.email });
          } else if (p.code === 422 && p.fieldErrors.full_name) {
            form.setError("full_name", { message: p.fieldErrors.full_name });
          } else {
            setTopError(p.message);
          }
        },
      },
    );
  });

  return (
    <FormDialogShell
      title={t("admin.users.create_title")}
      description={t("admin.users.create_desc")}
      topError={topError}
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("admin.users.email_label")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>
                  {t("admin.users.full_name_label")}
                </FormLabel>
                <FormControl>
                  <TextField
                    maxLength={120}
                    placeholder={t("admin.users.full_name_ph")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {isSuper && (
            <Controller
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="create-user-role">
                    {t("admin.users.role_label")}
                  </Label>
                  <Select<RoleOption>
                    inputId="create-user-role"
                    isSearchable={false}
                    isClearable={false}
                    options={roleOptions}
                    value={
                      roleOptions.find((o) => o.value === field.value) ?? null
                    }
                    onChange={(o) => field.onChange(o?.value ?? "")}
                  />
                </div>
              )}
            />
          )}
          <DialogFooter className="!mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="size-4" />
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={create.isPending}>
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </FormDialogShell>
  );
}

function EditUserForm({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const isSuper = hasPermission("*");
  const { options: roleOptions } = useRoleOptions(isSuper);

  const currentUserId = useAuthStore((s) => s.user?.id);
  const isSelf = currentUserId === user.id;
  const currentRoleId = user.roles?.[0]?.id ?? "";

  const form = useForm<EditUserValues>({
    resolver: zodResolver(makeEditUserSchema(t)),
    defaultValues: {
      full_name: user.full_name,
      status: user.status === "locked" ? "active" : user.status,
      role_id: currentRoleId,
    },
    mode: "onChange",
  });
  const update = useUpdateUser();
  const [topError, setTopError] = useState<string | null>(null);

  // Self can't disable self (BE blocks too) — drop the option entirely.
  const statusOptions = [
    { value: "active", label: t("admin.users.status.active") },
    ...(isSelf
      ? []
      : [{ value: "disabled", label: t("admin.users.status.disabled") }]),
  ];

  const onSubmit = form.handleSubmit((v) => {
    setTopError(null);
    update.mutate(
      {
        id: user.id,
        body: {
          full_name: v.full_name.trim(),
          status: v.status,
          // Role change is super_admin only and only when it actually changed.
          ...(isSuper && v.role_id && v.role_id !== currentRoleId
            ? { role_id: v.role_id }
            : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(t("admin.users.updated"));
          onClose();
        },
        onError: (err) => {
          const p = parseApiError(err, t);
          if (p.code === 422 && p.fieldErrors.full_name) {
            form.setError("full_name", { message: p.fieldErrors.full_name });
          } else {
            // cannot_modify_self / last_super_admin / privilege_escalation_denied → top banner.
            setTopError(p.message);
          }
        },
      },
    );
  });

  return (
    <FormDialogShell
      title={t("admin.users.edit_title")}
      description={t("admin.users.edit_desc")}
      topError={topError}
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-user-email">
              {t("admin.users.email_label")}
            </Label>
            <Input id="edit-user-email" value={user.email} disabled readOnly />
          </div>
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>
                  {t("admin.users.full_name_label")}
                </FormLabel>
                <FormControl>
                  <TextField maxLength={120} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label htmlFor="edit-user-status">
                  {t("admin.users.status_label")}
                </Label>
                <Select<RoleOption>
                  inputId="edit-user-status"
                  isSearchable={false}
                  isClearable={false}
                  options={statusOptions}
                  value={
                    statusOptions.find((o) => o.value === field.value) ?? null
                  }
                  onChange={(o) => field.onChange(o?.value ?? "active")}
                />
              </div>
            )}
          />
          {isSuper && (
            <Controller
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-role">
                    {t("admin.users.role_label")}
                  </Label>
                  <Select<RoleOption>
                    inputId="edit-user-role"
                    isSearchable={false}
                    isClearable={false}
                    options={roleOptions}
                    value={
                      roleOptions.find((o) => o.value === field.value) ?? null
                    }
                    onChange={(o) => field.onChange(o?.value ?? "")}
                  />
                </div>
              )}
            />
          )}
          <DialogFooter className="!mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="size-4" />
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={update.isPending}>
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </FormDialogShell>
  );
}

function FormDialogShell({
  title,
  description,
  topError,
  onClose,
  children,
}: {
  title: string;
  description: string;
  topError: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {topError && <Alert variant="danger" message={topError} />}
        {children}
      </DialogContent>
    </Dialog>
  );
}
