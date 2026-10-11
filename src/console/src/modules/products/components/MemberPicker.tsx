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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMembers } from "@/modules/members/hooks/useMembers";
import { cn } from "@/lib/utils";

/** One row of the picker: a member plus the role they played on THIS product. */
export interface ProductMemberDraft {
  member_id: string;
  full_name: string;
  slug: string;
  avatar_url: string | null;
  /** Their general role, shown as the placeholder when no per-product role is set. */
  default_role: string | null;
  role: string;
}

function Row({
  entry,
  disabled,
  onRoleChange,
  onRemove,
}: {
  entry: ProductMemberDraft;
  disabled?: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.member_id, disabled });

  const initials = entry.full_name
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background p-2",
        isDragging && "opacity-50",
      )}
      data-testid="product-member-row"
    >
      {!disabled && (
        <button
          type="button"
          aria-label={t("products.members.reorder")}
          className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {entry.avatar_url ? (
          <img src={entry.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </span>
      <span className="w-40 shrink-0 truncate text-sm font-medium">
        {entry.full_name}
      </span>
      <Input
        value={entry.role}
        disabled={disabled}
        maxLength={160}
        // The placeholder is their general role, so an empty box visibly means
        // "the site will show that" rather than "nothing".
        placeholder={entry.default_role ?? t("products.members.role_ph")}
        aria-label={t("products.members.role_for", { name: entry.full_name })}
        onChange={(e) => onRoleChange(e.target.value)}
      />
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("common.remove")}
          onClick={onRemove}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

// Ordered list of the people who built a product, each with a per-product role.
// Order here is the order the public page shows them in, so it is drag-sortable.
export function MemberPicker({
  value,
  onChange,
  disabled,
}: {
  value: ProductMemberDraft[];
  onChange: (next: ProductMemberDraft[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Only the people shown on the site are offerable; a hidden member would
  // appear on a product page while absent from the team page.
  const members = useMembers({ active: true, page: 1, page_size: 100 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const chosen = new Set(value.map((v) => v.member_id));
  const available = (members.data?.items ?? []).filter((m) => !chosen.has(m.id));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = value.findIndex((v) => v.member_id === active.id);
    const to = value.findIndex((v) => v.member_id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(value, from, to));
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.map((v) => v.member_id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2" data-testid="product-member-list">
              {value.map((entry, i) => (
                <li key={entry.member_id}>
                  <Row
                    entry={entry}
                    disabled={disabled}
                    onRoleChange={(role) =>
                      onChange(
                        value.map((v, j) => (i === j ? { ...v, role } : v)),
                      )
                    }
                    onRemove={() => onChange(value.filter((_, j) => j !== i))}
                  />
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-4" />
              {t("products.members.add")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder={t("products.members.search_ph")} />
              <CommandList>
                <CommandEmpty>{t("products.members.none_left")}</CommandEmpty>
                <CommandGroup>
                  {available.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.full_name}
                      onSelect={() => {
                        onChange([
                          ...value,
                          {
                            member_id: m.id,
                            full_name: m.full_name,
                            slug: m.slug,
                            avatar_url: m.avatar_url,
                            default_role: m.role,
                            role: "",
                          },
                        ]);
                        setOpen(false);
                      }}
                    >
                      {m.full_name}
                      {m.role && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {m.role}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
