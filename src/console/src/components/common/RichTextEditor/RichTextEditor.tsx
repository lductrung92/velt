import { EditorContent, useEditor, type Editor, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import { memo, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RichTextDoc = Record<string, unknown>;

export interface RichTextEditorProps {
  /** Current HTML value (the canonical body_html). */
  value: string;
  /** Fires on every change with the rendered HTML + the Tiptap JSON doc. */
  onChange: (html: string, json: RichTextDoc) => void;
  editable?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * Extra Tiptap extensions (e.g. inline-widget node). Read once on mount.
   * Keeps this shared editor decoupled from feature modules.
   */
  extraExtensions?: Extensions;
  /** Extra toolbar controls, rendered after the built-in actions. */
  renderToolbarExtras?: (editor: Editor | null) => ReactNode;
  /**
   * Seed content from a Tiptap JSON doc instead of `value` HTML. Required to
   * round-trip nodes whose state lives in JSON (inline widgets) and would be
   * lost through HTML. When set, the HTML→editor sync is disabled; the JSON is
   * re-seeded whenever this prop's identity changes (e.g. loading a page).
   */
  initialJSON?: RichTextDoc | null;
}

// Toolbar verbs allowlisted to match the backend bluemonday sanitizer
// (media-handling §3): no headings above H3, no tables/iframes in the body.
const ACTIONS: {
  key: string;
  icon: LucideIcon;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}[] = [
  {
    key: "bold",
    icon: Bold,
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: "italic",
    icon: Italic,
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: "strike",
    icon: Strikethrough,
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    key: "h2",
    icon: Heading2,
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: "h3",
    icon: Heading3,
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    key: "bullet_list",
    icon: List,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: "ordered_list",
    icon: ListOrdered,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: "blockquote",
    icon: Quote,
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

// Tiptap WYSIWYG that emits body_html + body_json. Memo'd so the heavy useEditor
// doesn't re-init on every parent keystroke; external value changes (form.reset)
// are synced back in via useEffect. Heavy chunk → lazy-loaded by the editor page.
function RichTextEditorBase({
  value,
  onChange,
  editable = true,
  className,
  ariaLabel,
  extraExtensions,
  renderToolbarExtras,
  initialJSON,
}: RichTextEditorProps) {
  const { t } = useTranslation();
  const editor = useEditor({
    extensions: [StarterKit, ...(extraExtensions ?? [])],
    content: initialJSON ?? value,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getJSON()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[14rem] px-3 py-2 focus:outline-none",
        "aria-label": ariaLabel ?? t("editor.aria_label"),
      },
    },
  });

  // Sync external value resets (e.g. loading an article) without clobbering the
  // user's caret while they type (only when it genuinely differs). Disabled in
  // JSON-seed mode — there the JSON doc is the source of truth (HTML would drop
  // widget state).
  useEffect(() => {
    if (!editor || editor.isDestroyed || initialJSON != null) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor, initialJSON]);

  // Re-seed from a JSON doc whenever its identity changes (a different doc loaded
  // async after mount, or navigation to another page). Keyed by reference so live
  // edits — which keep the same prop object — never re-seed and jump the caret.
  const seededJSON = useRef<RichTextDoc | null>(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed || initialJSON == null) return;
    if (seededJSON.current === initialJSON) return;
    seededJSON.current = initialJSON;
    editor.commands.setContent(initialJSON, { emitUpdate: false });
  }, [initialJSON, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  return (
    <div className={cn("rounded-md border bg-background", className)}>
      {editable && (
        <div className="flex flex-wrap gap-0.5 border-b p-1">
          {ACTIONS.map(({ key, icon: Icon, isActive, run }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t(`editor.${key}`)}
              title={t(`editor.${key}`)}
              aria-pressed={editor ? isActive(editor) : false}
              className={
                editor && isActive(editor)
                  ? "bg-accent text-accent-foreground"
                  : ""
              }
              onClick={() => editor && run(editor)}
            >
              <Icon className="size-4" />
            </Button>
          ))}
          {renderToolbarExtras?.(editor)}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

export const RichTextEditor = memo(RichTextEditorBase);
