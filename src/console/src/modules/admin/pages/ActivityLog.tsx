import {
  ArrowRight,
  Bot,
  CalendarDays,
  History,
  RotateCcw,
  Search,
  User,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import { DateRangeField } from "@/components/common/DateField";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_PAGE_SIZE,
  TablePagination,
} from "@/components/ui/table-pagination";
import { parseApiError } from "@/utils/apiError";

import { useActivity, useActivityActions } from "../hooks/useActivity";
import type { ActivityEntry } from "../services/activity.service";
import "@/styles/list-page.css";
import "./activity.css";

// Steps for the relative clock, each the number of the previous unit that fits
// in the next one. Years are the remainder, so the list stops at months.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.345],
  ["month", 12],
];

// A date input gives a calendar day; the API wants an instant. Resolved in the
// viewer's own timezone so "today" means their today, not UTC's.
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

type Target = { entity: string; id: string; label: string };

export default function ActivityLog() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [target, setTarget] = useState<Target | null>(null);

  const params = {
    page,
    page_size: DEFAULT_PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(action ? { action } : {}),
    ...(actor ? { actor_id: actor.id } : {}),
    ...(target ? { entity: target.entity, entity_id: target.id } : {}),
    ...(from ? { from: dayStart(from) } : {}),
    ...(to ? { to: dayEnd(to) } : {}),
  };
  const list = useActivity(params);
  const actions = useActivityActions();

  const relative = useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(i18n.language, {
      numeric: "auto",
    });
    return (iso: string) => {
      let value = (Date.parse(iso) - Date.now()) / 1000;
      for (const [unit, span] of UNITS) {
        if (Math.abs(value) < span) return rtf.format(Math.round(value), unit);
        value /= span;
      }
      return rtf.format(Math.round(value), "year");
    };
  }, [i18n.language]);
  const exact = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
    return (iso: string) => fmt.format(new Date(iso));
  }, [i18n.language]);

  // Codes are machine-readable and outlive their translations: a module ships a
  // new one long before anybody writes a label for it, so an unknown code shows
  // itself rather than an empty cell.
  const actionLabel = (code: string) =>
    t(`activity.action.${code}`, { defaultValue: code });

  const reset = () => {
    setQ("");
    setDraftQ("");
    setAction("");
    setFrom("");
    setTo("");
    setActor(null);
    setTarget(null);
    setPage(1);
  };
  const hasFilters = !!(q || action || from || to || actor || target);

  const chips: FilterChip[] = [];
  if (q)
    chips.push({
      key: "q",
      label: t("activity.search_label"),
      value: q,
      onRemove: () => {
        setQ("");
        setDraftQ("");
        setPage(1);
      },
    });
  if (action)
    chips.push({
      key: "action",
      label: t("activity.col.action"),
      value: actionLabel(action),
      onRemove: () => {
        setAction("");
        setPage(1);
      },
    });
  if (actor)
    chips.push({
      key: "actor",
      label: t("activity.col.actor"),
      value: actor.label,
      onRemove: () => {
        setActor(null);
        setPage(1);
      },
    });
  if (target)
    chips.push({
      key: "target",
      label: t("activity.col.target"),
      value: target.label,
      onRemove: () => {
        setTarget(null);
        setPage(1);
      },
    });
  if (from || to)
    chips.push({
      key: "range",
      label: t("activity.col.when"),
      value: `${from || "…"} → ${to || "…"}`,
      onRemove: () => {
        setFrom("");
        setTo("");
        setPage(1);
      },
    });

  const rows = list.data?.items ?? [];

  // An audit screen needs both clocks: relative to judge "was that just now or
  // last month", exact to quote in a ticket. The element carries the machine
  // value too, so a copy out of the page is unambiguous.
  const when = (e: ActivityEntry) => (
    <time className="activity-when" dateTime={e.occurred_at}>
      <strong>{relative(e.occurred_at)}</strong>
      <span>{exact(e.occurred_at)}</span>
    </time>
  );

  const who = (e: ActivityEntry) =>
    e.actor_id ? (
      <button
        type="button"
        className="activity-link activity-actor"
        title={t("activity.filter_by_actor", { name: e.actor_label })}
        onClick={() => {
          setActor({ id: e.actor_id as string, label: e.actor_label });
          setPage(1);
        }}
      >
        <User className="size-3.5 shrink-0" aria-hidden />
        {e.actor_label}
      </button>
    ) : (
      // No actor id means the system acted on its own — a scheduled publish, a
      // cron — and there is nobody to filter by.
      <span className="activity-actor activity-system">
        <Bot className="size-3.5 shrink-0" aria-hidden />
        {e.actor_label}
      </span>
    );

  const what = (e: ActivityEntry) => {
    const label = actionLabel(e.action);
    return (
      <span className="activity-action">
        <strong>{label}</strong>
        {label !== e.action && <code>{e.action}</code>}
      </span>
    );
  };

  const onWhat = (e: ActivityEntry) => {
    if (!e.entity_label && !e.entity)
      return <span className="activity-muted">{t("activity.no_target")}</span>;
    const label = e.entity_label ?? e.entity_id ?? "";
    const kind = e.entity
      ? t(`activity.entity.${e.entity}`, { defaultValue: e.entity })
      : "";
    const body = (
      <>
        <strong>{label}</strong>
        {kind && <span>{kind}</span>}
      </>
    );
    return e.entity && e.entity_id ? (
      <button
        type="button"
        className="activity-link activity-target"
        title={t("activity.filter_by_target", { name: label })}
        onClick={() => {
          setTarget({
            entity: e.entity as string,
            id: e.entity_id as string,
            label,
          });
          setPage(1);
        }}
      >
        {body}
      </button>
    ) : (
      <span className="activity-target">{body}</span>
    );
  };

  return (
    <div className="list-page" data-list="activity">
      <PageHeader
        title={t("activity.title")}
        subtitle={t("activity.subtitle")}
        breadcrumbs={[{ labelKey: "nav.activity" }]}
      />

      <section className="list-panel" aria-label={t("activity.list_title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("activity.list_title")}</h2>
            <p>
              {list.isPending || list.isError
                ? t("activity.list_hint")
                : t("activity.record_count", { count: list.data?.total ?? 0 })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <RotateCcw
              className={
                list.isFetching
                  ? "size-3.5 animate-spin motion-reduce:animate-none"
                  : "size-3.5"
              }
              aria-hidden
            />
            {t("common.refresh")}
          </Button>
        </div>

        {/* No status axis here, so the toolbar closes the panel itself. */}
        <div className="list-toolbar list-toolbar-edge">
          <form
            className="list-search"
            onSubmit={(event) => {
              event.preventDefault();
              setQ(draftQ.trim());
              setPage(1);
            }}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={draftQ}
              aria-label={t("activity.search_label")}
              placeholder={t("activity.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
                if (!value && q) {
                  setQ("");
                  setPage(1);
                }
              }}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("activity.apply_search")}
              title={t("activity.apply_search")}
            >
              <ArrowRight className="size-4" />
            </Button>
          </form>
          <div className="list-filter-controls">
            <div className="list-filter-select">
              <Select
                inputId="activity-filter-action"
                aria-label={t("activity.col.action")}
                placeholder={t("activity.all_actions")}
                isLoading={actions.isPending}
                value={
                  action ? { value: action, label: actionLabel(action) } : null
                }
                options={(actions.data ?? []).map((code) => ({
                  value: code,
                  label: actionLabel(code),
                }))}
                onChange={(option) => {
                  setAction(option?.value ?? "");
                  setPage(1);
                }}
              />
            </div>
            <div className="activity-range">
              <DateRangeField
                from={from}
                to={to}
                aria-label={t("activity.range")}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom);
                  setTo(nextTo);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <FilterChips
          className="list-filter-chips"
          items={chips}
          onClearAll={chips.length ? reset : undefined}
        />
        {list.data?.search_from && (
          // The backend refuses to scan the whole history for a substring, so
          // say which slice the result covers instead of implying it is all.
          <p className="activity-window-note">
            {t("activity.search_window", {
              since: exact(list.data.search_from),
            })}
          </p>
        )}

        {list.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(list.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void list.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : list.isPending ? (
          <div className="list-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="list-empty">
            <div className="list-empty-art" aria-hidden>
              <span className="list-empty-ring" />
              <div className="list-empty-card">
                <span>
                  <History className="size-5" />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <CalendarDays className="list-empty-plus" />
              </div>
            </div>
            <h3>
              {t(hasFilters ? "activity.no_results" : "activity.empty_title")}
            </h3>
            <p>
              {t(
                hasFilters
                  ? "activity.no_results_hint"
                  : "activity.empty_description",
              )}
            </p>
            {hasFilters && (
              <Button size="sm" variant="outline" onClick={reset}>
                <X className="size-3.5" />
                {t("activity.reset_filters")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="list-desktop">
              <Table
                scroll={false}
                data-testid="activity-table"
                wrapperClassName="list-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("activity.col.when")}</TableHead>
                    <TableHead>{t("activity.col.actor")}</TableHead>
                    <TableHead>{t("activity.col.action")}</TableHead>
                    <TableHead>{t("activity.col.target")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id} data-testid="activity-row">
                      <TableCell>{when(e)}</TableCell>
                      <TableCell>{who(e)}</TableCell>
                      <TableCell>{what(e)}</TableCell>
                      <TableCell>{onWhat(e)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="list-mobile">
              {rows.map((e) => (
                <article
                  key={e.id}
                  className="activity-mobile-card"
                  data-testid="activity-card"
                >
                  <div className="activity-mobile-heading">
                    {what(e)}
                    {when(e)}
                  </div>
                  <div className="activity-mobile-footer">
                    {who(e)}
                    {onWhat(e)}
                  </div>
                </article>
              ))}
            </div>
            <div className="list-pagination">
              <TablePagination
                page={list.data?.page ?? page}
                pageSize={list.data?.page_size ?? DEFAULT_PAGE_SIZE}
                total={list.data?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
