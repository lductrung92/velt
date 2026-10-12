import {
  ArrowRight,
  CalendarDays,
  Sparkles,
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
import { DashboardArtwork } from "./DashboardArtwork";
import { DailyOverview } from "./DailyOverview";
import "./dashboard.css";

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
    <section className="dashboard-panel min-w-0 rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </h2>
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
        <div className="dashboard-empty flex flex-col items-center justify-center px-5 py-7 text-center">
          <div className="dashboard-empty-art" aria-hidden>
            <span className="dashboard-empty-orbit" />
            <span className="dashboard-empty-sheet dashboard-empty-sheet-back" />
            <span className="dashboard-empty-sheet">
              <span className="dashboard-empty-symbol">
                <Icon className="size-6" strokeWidth={1.5} />
              </span>
              <span className="dashboard-empty-line" />
              <span className="dashboard-empty-line dashboard-empty-line-short" />
            </span>
            <span className="dashboard-empty-plus">
              <Plus className="size-3.5" />
            </span>
          </div>
          <p className="text-sm font-semibold">
            {t(
              to === "/products"
                ? "dashboard.empty_products"
                : "dashboard.empty_articles",
            )}
          </p>
          <p className="mt-2 max-w-64 text-xs leading-5 text-muted-foreground">
            {t(
              to === "/products"
                ? "dashboard.empty_products_description"
                : "dashboard.empty_articles_description",
            )}
          </p>
          {createTo && (
            <Button asChild variant="outline" className="mt-5 text-xs">
              <Link to={createTo}>
                <Plus className="size-3.5" aria-hidden />
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
    <div className="dashboard space-y-5">
      <PageHeader
        title={t("dashboard.title")}
        actions={
          <div className="flex items-center gap-3">
            <time
              className="flex items-center gap-2 text-xs text-muted-foreground"
              dateTime={new Date().toISOString()}
            >
              <CalendarDays className="size-3.5" aria-hidden />
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
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <p className="dashboard-eyebrow">
            <span />
            {t("dashboard.workspace")}
          </p>
          <h2>
            {t("dashboard.welcome", {
              name: user?.full_name || user?.email || t("dashboard.friend"),
            })}
          </h2>
          <p className="dashboard-welcome-description">
            {t("dashboard.welcome_description")}
          </p>
        </div>
        <DashboardArtwork />
      </section>
      {stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.map(({ key, icon: Icon, to, query, total }) => (
            <Link
              key={key}
              to={to}
              className={`dashboard-stat dashboard-tone-${key} group min-w-0 rounded-lg border bg-background p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5`}
            >
              <div className="flex min-h-10 items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {t(`dashboard.stats.${key}`)}
                </span>
                <span className="dashboard-stat-icon flex size-10 items-center justify-center rounded-lg">
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
                  <span className="text-4xl font-semibold tabular-nums tracking-tight">
                    {query.isError
                      ? "—"
                      : total?.toLocaleString(i18n.resolvedLanguage)}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
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
        <p className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          {t("dashboard.no_access")}
        </p>
      )}

      <div
        className={
          actions.length > 0
            ? "dashboard-content"
            : "dashboard-content dashboard-content-no-actions"
        }
      >
        {actions.length > 0 && (
          <section className="dashboard-quick dashboard-panel min-w-0 rounded-lg border bg-background p-5">
            <span className="dashboard-quick-heading-icon">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-base font-semibold">
              {t("dashboard.quick_title")}
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {t("dashboard.quick_description")}
            </p>
            <div className="mt-5 space-y-2">
              {actions.map(({ key, icon: Icon, to }) => (
                <Link
                  key={key}
                  to={to}
                  aria-label={t(`dashboard.actions.${key}`)}
                  className="dashboard-quick-link group flex items-center gap-3 rounded-lg p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="dashboard-quick-icon flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon
                      className="size-[18px]"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">
                      {t(`dashboard.actions.${key}`)}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                      {t(`dashboard.action_descriptions.${key}`)}
                    </span>
                  </span>
                  <Plus
                    className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          </section>
        )}
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
      <DailyOverview />
    </div>
  );
}
