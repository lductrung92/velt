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
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips } from "@/components/common/FilterChips";
import { FilterPopover } from "@/components/common/FilterPopover";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { SortableHead } from "@/components/common/SortableHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableEmpty,
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<Member[]>([]);
  useEffect(() => {
    if (list.data) setOrder(list.data.items);
  }, [list.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
      const [col, dir] = sort.split(":");
      const sign = dir === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => {
        const av = col === "role" ? (a.role ?? "") : a.full_name;
        const bv = col === "role" ? (b.role ?? "") : b.full_name;
        return sign * av.localeCompare(bv, "vi");
      });
    }
    return out;
  }, [order, q, sort]);

  const filterChips = q
    ? [{ key: "q", label: t("members.search_label"), value: q, onRemove: () => setQ("") }]
    : [];

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
    <div className="space-y-3">
      <PageHeader title={t("members.title")} subtitle={t("members.subtitle")} />

      <ListToolbar
        onRefresh={() => void list.refetch()}
        refreshDisabled={list.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open);
              if (open) setDraftQ(q);
            }}
            onApply={() => {
              setQ(draftQ.trim());
              setFilterOpen(false);
            }}
            onReset={() => setDraftQ("")}
            filterActive={q !== ""}
          >
            <div className="space-y-1.5">
              <Label htmlFor="member-q">{t("members.search_label")}</Label>
              <Input
                id="member-q"
                type="search"
                value={draftQ}
                placeholder={t("members.search_ph")}
                onChange={(e) => setDraftQ(e.target.value)}
              />
            </div>
          </FilterPopover>
        }
      >
        {canManage && (
          <Button type="button" onClick={() => navigate("/members/new")}>
            <Plus className="size-4" />
            {t("members.create")}
          </Button>
        )}
      </ListToolbar>

      <FilterChips items={filterChips} onClearAll={q ? () => setQ("") : undefined} />

      {list.isError ? (
        <Alert variant="danger" message={parseApiError(list.error, t).message} />
      ) : list.isLoading && !list.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table scroll={false} data-testid="members-table">
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
              {rows.length === 0 && <TableEmpty colSpan={5} />}
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
        </DndContext>
      )}

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
