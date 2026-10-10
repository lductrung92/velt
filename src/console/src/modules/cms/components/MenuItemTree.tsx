import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo, useState } from "react";

import {
  flattenTree,
  getProjection,
  removeDescendants,
  type FlatMenuItem,
  type MenuItemDraft,
} from "../utils/menuTree";
import { MenuItemTreeRow } from "./MenuItemTreeRow";

// Drag-and-drop tree of menu items. Reorder + nest reuse the same projection
// geometry as the category tree; a drop emits the post-drag flat order +
// projected parent so the caller rebuilds the draft tree.
export function MenuItemTree({
  draft,
  selectedKey,
  onSelect,
  onEdit,
  onDelete,
  onMove,
}: {
  draft: MenuItemDraft[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onMove: (
    clonedFlat: FlatMenuItem[],
    activeKey: string,
    parentKey: string | null,
  ) => void;
}) {
  const flat = useMemo(() => flattenTree(draft), [draft]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // While dragging, lift the active node's subtree out so it can't drop inside
  // itself; otherwise render the full flat tree.
  const rows = activeId ? removeDescendants(flat, activeId) : flat;

  const projected =
    activeId && overId && activeId !== overId
      ? getProjection(rows, activeId, overId, offsetLeft)
      : null;

  function resetDrag() {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    setOffsetLeft(0);
  }
  function handleDragMove(e: DragMoveEvent) {
    setOffsetLeft(e.delta.x);
  }
  function handleDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function handleDragEnd(e: DragEndEvent) {
    const activeKey = String(e.active.id);
    const overKey = e.over ? String(e.over.id) : null;
    const dx = e.delta.x;
    resetDrag();
    if (!overKey) return;

    const list = removeDescendants(flat, activeKey);
    const aIdx = list.findIndex((i) => i.key === activeKey);
    const oIdx = list.findIndex((i) => i.key === overKey);
    if (aIdx === -1 || oIdx === -1) return;

    const proj = getProjection(list, activeKey, overKey, dx);
    const cloned = arrayMove(list, aIdx, oIdx);
    onMove(cloned, activeKey, proj.parentKey);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <SortableContext
        items={rows.map((n) => n.key)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-1" data-testid="cms-menu-item-tree">
          {rows.map((node) => (
            <li key={node.key}>
              <MenuItemTreeRow
                node={node}
                depth={
                  node.key === activeId && projected
                    ? projected.depth
                    : node.depth
                }
                selected={node.key === selectedKey}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
