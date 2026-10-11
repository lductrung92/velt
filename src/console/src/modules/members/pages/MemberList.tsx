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
import { Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { MemberCard } from "../components/MemberCard";
import {
  useDeleteMember,
  useMembers,
  useReorderMembers,
} from "../hooks/useMembers";
import type { Member } from "../services/members.service";

// The roster is a curated list a team edits by hand, not a dataset: one page
// holds it. There is deliberately no search or pagination — filtering would
// make the drag order meaningless (you cannot reorder a subset), and that
// ordering is the whole point of this screen.
const PAGE_SIZE = 100;

export default function MemberList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("members.manage");

  const [pending, setPending] = useState<Member | null>(null);

  const list = useMembers({ page: 1, page_size: PAGE_SIZE });
  const reorder = useReorderMembers();
  const remove = useDeleteMember();

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<Member[]>([]);
  useEffect(() => {
    if (list.data) setOrder(list.data.items);
  }, [list.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      >
        {canManage && (
          <Button type="button" onClick={() => navigate("/members/new")}>
            <Plus className="size-4" />
            {t("members.create")}
          </Button>
        )}
      </ListToolbar>

      {list.isError ? (
        <Alert variant="danger" message={parseApiError(list.error, t).message} />
      ) : list.isLoading && !list.data ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      ) : order.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("members.empty.title")}
          description={t("members.empty.description")}
          onAdd={canManage ? () => navigate("/members/new") : undefined}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={order.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2" data-testid="member-list">
              {order.map((m) => (
                <li key={m.id}>
                  <MemberCard
                    member={m}
                    canManage={canManage}
                    onEdit={(id) => navigate(`/members/${id}`)}
                    onDelete={setPending}
                  />
                </li>
              ))}
            </ul>
          </SortableContext>
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
