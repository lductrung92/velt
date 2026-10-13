import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RowAction, RowActions } from "@/components/common/RowActions";
import { SortableHead } from "@/components/common/SortableHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { MemberRow } from "../components/MemberRow";
import {
  useDeleteMember,
  useMembers,
  useReorderMembers,
} from "../hooks/useMembers";
import type { Member } from "../services/members.service";

import "@/styles/list-page.css";

// The roster is a curated list a team edits by hand, not a dataset: one page
// holds it, so there is no pagination.
//
// Searching and sorting both switch drag-reorder off — ordering by sort_order
// only means anything on the full, unfiltered list, and that ordering is what
// the public team page renders. Same rule as the product taxonomy screen.
const PAGE_SIZE = 100;

export default function MemberList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("members.manage");

  const list = useMembers({ page: 1, page_size: PAGE_SIZE });
  const reorder = useReorderMembers();
  const remove = useDeleteMember();

  const [pending, setPending] = useState<Member | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<Member[]>([]);
  useEffect(() => {
    if (list.data) setOrder(list.data.items);
  }, [list.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorderable = q === "" && sort === null;

  const rows = useMemo(() => {
    let out = order;
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter(
        (m) =>
          m.full_name.toLowerCase().includes(needle) ||
          (m.role ?? "").toLowerCase().includes(needle) ||
          m.skills.some((s) => s.toLowerCase().includes(needle)),
      );
    }
    if (sort) {
      // SortableHead speaks the API convention ("role" asc, "-role" desc), not
      // "col:dir" — splitting on ":" left dir undefined, so descending never
      // reversed and "-role" missed the role branch and sorted by name instead.
      const desc = sort.startsWith("-");
      const col = desc ? sort.slice(1) : sort;
      const sign = desc ? -1 : 1;
      out = [...out].sort((a, b) => {
        const av = col === "role" ? (a.role ?? "") : a.full_name;
        const bv = col === "role" ? (b.role ?? "") : b.full_name;
        return sign * av.localeCompare(bv, "vi");
      });
    }
    return out;
  }, [order, q, sort]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((m) => m.id === active.id);
    const to = order.findIndex((m) => m.id === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(order, from, to);
    const previous = order;
    setOrder(next);
    reorder.mutate(
      next.map((m) => m.id),
      {
        onError: (err) => {
          // Put the list back where the user had it, or the UI would claim an
          // order the server does not have.
          setOrder(previous);
          toast.error(parseApiError(err, t).message);
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!pending) return;
    const target = pending;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.success(t("members.deleted", { name: target.full_name }));
        setPending(null);
      },
      onError: (err) => toast.error(parseApiError(err, t).message),
    });
  };

  return (
    <div className="list-page" data-list="members">
      <PageHeader title={t("members.title")} subtitle={t("members.subtitle")} />

      <section className="list-panel" aria-label={t("members.title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("members.list_title")}</h2>
          </div>
          <div className="flex items-center gap-2">
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
            {canManage && (
              <Button
                type="button"
                size="sm"
                onClick={() => navigate("/members/new")}
              >
                <Plus className="size-4" />
                {t("members.create")}
              </Button>
            )}
          </div>
        </div>

        {/* No status axis here, so no tabs row — the toolbar carries the rule
            that would otherwise come from it. */}
        <div className="list-toolbar list-toolbar-edge">
          <form
            className="list-search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={q}
              aria-label={t("members.search_label")}
              placeholder={t("members.search_ph")}
              // The whole roster is already in memory, so searching as you type
              // costs nothing and waiting for Enter would be pure friction.
              onChange={(event) => setQ(event.target.value)}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("members.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </div>

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
        ) : list.isLoading && !list.data ? (
          <div className="list-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="list-empty">
            <div className="list-empty-art" aria-hidden>
              <span className="list-empty-ring" />
              <div className="list-empty-card">
                <span>
                  <Users className="size-5" />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <Plus className="list-empty-plus" />
              </div>
            </div>
            <h3>{t(q ? "members.no_results" : "members.empty_title")}</h3>
            <p>{t(q ? "members.no_results_hint" : "members.empty_hint")}</p>
            {!q && canManage && (
              <Button size="sm" onClick={() => navigate("/members/new")}>
                <Plus className="size-4" />
                {t("members.create")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="list-desktop">
                <Table
                  scroll={false}
                  data-testid="members-table"
                  wrapperClassName="list-table-wrap"
                >
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        col="name"
                        label={t("members.col.name")}
                        sort={sort}
                        onSort={setSort}
                      />
                      <SortableHead
                        col="role"
                        label={t("members.col.role")}
                        sort={sort}
                        onSort={setSort}
                      />
                      <TableHead>{t("members.col.skills")}</TableHead>
                      <TableHead className="text-right">
                        {t("members.col.sort_order")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("members.col.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SortableContext
                      items={rows.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {rows.map((m) => (
                        <MemberRow
                          key={m.id}
                          member={m}
                          canManage={canManage}
                          reorderable={canManage && reorderable}
                          onEdit={(id) => navigate(`/members/${id}`)}
                          onDelete={setPending}
                        />
                      ))}
                    </SortableContext>
                  </TableBody>
                </Table>
              </div>
            </DndContext>

            {/* Reading only: dragging needs a pointer, so the handle stays on
                the desktop table. */}
            <div className="list-mobile" data-testid="members-cards">
              {rows.map((m) => (
                <div
                  className="flex flex-col gap-2.5 border-b p-3.5 last:border-b-0"
                  key={m.id}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {m.full_name}
                      </span>
                      {!m.is_active && (
                        <Badge variant="secondary">{t("members.hidden")}</Badge>
                      )}
                    </div>
                    <RowActions className="shrink-0">
                      <RowAction
                        icon={Pencil}
                        label={t("common.edit")}
                        onClick={() => navigate(`/members/${m.id}`)}
                      />
                      {canManage && (
                        <RowAction
                          destructive
                          icon={Trash2}
                          label={t("common.delete")}
                          onClick={() => setPending(m)}
                        />
                      )}
                    </RowActions>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs text-muted-foreground">
                    <span>{m.role || t("members.no_role")}</span>
                    {m.skills.length > 0 && (
                      <span className="truncate">{m.skills.join(" · ")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("members.delete.title")}
        description={t("members.delete.description", {
          name: pending?.full_name ?? "",
        })}
        confirmLabel={t("common.delete")}
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
