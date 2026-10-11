import {
  ArrowRight,
  FileStack,
  FileText,
  Package,
  Plus,
  RotateCcw,
  Users2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/modules/auth";
import { ArticleStatusBadge } from "@/modules/cms/components/ArticleStatusBadge";
import {
  ProductStatusBadge,
  ProductLifecycleBadge,
} from "@/modules/products/components/ProductStatusBadge";
import { useAuthStore } from "@/store/auth.store";
import { formatDateTime } from "@/utils/format";

import { countPages, useDashboardData } from "./useDashboardData";

interface RecentRecord {
  id: string;
  title: string;
  updatedAt: string;
  image?: string | null;
  badges: ReactNode;
}

function RecentPanel({
  title,
  to,
  icon: Icon,
  records,
  loading,
  failed,
  onRetry,
  createTo,
}: {
  title: string;
  to: string;
  icon: LucideIcon;
  records: RecentRecord[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  createTo?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link
          to={to}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t("dashboard.view_all")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-4 p-5" aria-label={t("common.loading")}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : failed ? (
        <div className="flex min-h-60 flex-col items-center justify-center gap-4 px-5 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            {t("dashboard.load_error")}
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </div>
      ) : records.length === 0 ? (
        <div className="flex min-h-60 flex-col items-center justify-center px-5 py-8 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <Icon className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="text-sm font-medium">{t("dashboard.empty_title")}</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
            {t("dashboard.empty_description")}
          </p>
          {createTo && (
            <Button asChild variant="outline" className="mt-4">
              <Link to={createTo}>
                <Plus className="size-4" aria-hidden />
                {t("dashboard.create_first")}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y">
          {records.map((record) => (
            <li key={record.id}>
              <Link
                to={`${to}/${record.id}`}
                className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                  {record.image ? (
                    <img
                      src={record.image}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <Icon className="size-5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-primary">
                    {record.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {record.badges}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("dashboard.updated", {
                      date: formatDateTime(record.updatedAt),
                    })}
                  </p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-primary"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = usePermission();
  const user = useAuthStore((state) => state.user);
  const access = {
    products: hasPermission("products.view"),
    articles: hasPermission("cms.article.view"),
    pages: hasPermission("cms.page.view"),
    members: hasPermission("members.view"),
  };
  const data = useDashboardData(access);
  const stats = [
    {
      key: "products",
      icon: Package,
      to: "/products",
      visible: access.products,
      query: data.products,
      total: data.products.data?.total,
    },
    {
      key: "articles",
      icon: FileText,
      to: "/cms/articles",
      visible: access.articles,
      query: data.articles,
      total: data.articles.data?.total,
    },
    {
      key: "pages",
      icon: FileStack,
      to: "/cms/pages",
      visible: access.pages,
      query: data.pages,
      total: data.pages.data ? countPages(data.pages.data) : undefined,
    },
    {
      key: "members",
      icon: Users2,
      to: "/members",
      visible: access.members,
      query: data.members,
      total: data.members.data?.total,
    },
  ].filter((stat) => stat.visible);
  const actions = [
    {
      key: "product",
      icon: Package,
      to: "/products/new",
      permission: "products.create",
    },
    {
      key: "article",
      icon: FileText,
      to: "/cms/articles/new",
      permission: "cms.article.create",
    },
    {
      key: "page",
      icon: FileStack,
      to: "/cms/pages/new",
      permission: "cms.page.create",
    },
    {
      key: "member",
      icon: Users2,
      to: "/members/new",
      permission: "members.manage",
    },
  ].filter((action) => hasPermission(action.permission));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.greeting", {
          name: user?.full_name || user?.email,
        })}
        actions={
          <div className="flex items-center gap-3">
            <time
              className="hidden text-xs text-muted-foreground lg:block"
              dateTime={new Date().toISOString()}
            >
              {new Intl.DateTimeFormat(i18n.resolvedLanguage || "vi", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </time>
            {stats.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("common.refresh")}
                title={t("common.refresh")}
                disabled={data.refreshing}
                onClick={() => void data.refresh()}
              >
                <RotateCcw
                  className={
                    data.refreshing
                      ? "size-4 animate-spin motion-reduce:animate-none"
                      : "size-4"
                  }
                  aria-hidden
                />
              </Button>
            )}
          </div>
        }
      />
      {stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.map(({ key, icon: Icon, to, query, total }) => (
            <Link
              key={key}
              to={to}
              className="group min-w-0 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            >
              <div className="flex min-h-10 items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {t(`dashboard.stats.${key}`)}
                </span>
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/5 text-primary">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
              </div>
              <div className="mt-3 flex min-h-10 items-center">
                {query.isPending ? (
                  <Skeleton
                    className="h-9 w-16"
                    aria-label={t("common.loading")}
                  />
                ) : (
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">
                    {query.isError
                      ? "—"
                      : total?.toLocaleString(i18n.resolvedLanguage)}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t(
                    query.isError ? "dashboard.load_error" : "dashboard.manage",
                  )}
                </span>
                <ArrowRight
                  className="size-3.5 group-hover:text-primary"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
          {t("dashboard.no_access")}
        </p>
      )}

      {actions.length > 0 && (
        <section className="rounded-xl border bg-background px-5 py-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold">
              {t("dashboard.quick_title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.quick_description")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {actions.map(({ key, icon: Icon, to }) => (
              <Link
                key={key}
                to={to}
                className="group flex items-center gap-3 rounded-lg border border-dashed p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon
                  className="size-5 shrink-0 text-primary"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {t(`dashboard.actions.${key}`)}
                </span>
                <Plus
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {access.products && (
          <RecentPanel
            title={t("dashboard.recent_products")}
            to="/products"
            icon={Package}
            records={(data.products.data?.items ?? []).map((item) => ({
              id: item.id,
              title: item.name,
              image: item.cover_url,
              updatedAt: item.updated_at,
              badges: (
                <>
                  <ProductStatusBadge status={item.status} />
                  <ProductLifecycleBadge lifecycle={item.lifecycle} />
                </>
              ),
            }))}
            loading={data.products.isPending}
            failed={data.products.isError}
            onRetry={() => void data.products.refetch()}
            createTo={
              hasPermission("products.create") ? "/products/new" : undefined
            }
          />
        )}
        {access.articles && (
          <RecentPanel
            title={t("dashboard.recent_articles")}
            to="/cms/articles"
            icon={FileText}
            records={(data.articles.data?.items ?? []).map((item) => ({
              id: item.id,
              title: item.title,
              updatedAt: item.updated_at,
              badges: <ArticleStatusBadge status={item.status} />,
            }))}
            loading={data.articles.isPending}
            failed={data.articles.isError}
            onRetry={() => void data.articles.refetch()}
            createTo={
              hasPermission("cms.article.create")
                ? "/cms/articles/new"
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
