import {
  EditorContent,
  useEditor,
  type Editor,
  type Extensions,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Shapes,
  Strikethrough,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SvgDialog } from "./SvgDialog";
import { SvgNode } from "./SvgExtension";
import { TableExtensions } from "./TableExtension";
import { TextAlignExtension } from "./TextAlignExtension";

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
// (media-handling §3): no headings above H3, no iframes in the body.
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
  // Left is the absence of an alignment, so its button clears rather than sets,
  // and reads as active while neither of the other two is.
  {
    key: "align_left",
    icon: AlignLeft,
    isActive: (e) =>
      !e.isActive({ textAlign: "center" }) &&
      !e.isActive({ textAlign: "right" }),
    run: (e) => e.chain().focus().setTextAlign(null).run(),
  },
  {
    key: "align_center",
    icon: AlignCenter,
    isActive: (e) => e.isActive({ textAlign: "center" }),
    run: (e) => e.chain().focus().setTextAlign("center").run(),
  },
  {
    key: "align_right",
    icon: AlignRight,
    isActive: (e) => e.isActive({ textAlign: "right" }),
    run: (e) => e.chain().focus().setTextAlign("right").run(),
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
  // Three columns with a header row is the shape nearly every table in the
  // articles has; Tab past the last cell adds the next row.
  {
    key: "table",
    icon: TableIcon,
    isActive: (e) => e.isActive("table"),
    run: (e) =>
      e
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
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
  const [svgOpen, setSvgOpen] = useState(false);
  const [svgDraft, setSvgDraft] = useState<{
    code: string;
    tab: "code" | "preview";
    apply?: (code: string) => void;
  }>({ code: "", tab: "code" });
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlignExtension,
      // Without the table nodes Tiptap has nowhere to put a <table> it parses:
      // it drops the element and keeps the cells as one run of text, so opening
      // an article with a table and saving it destroyed the table for good.
      ...TableExtensions,
      // The dialog belongs to the editor, not to each drawing: a drawing's
      // buttons ask for it and say what to do with the answer.
      SvgNode.configure({
        onEdit: ({ code, tab, apply }) => {
          setSvgDraft({ code, tab, apply });
          setSvgOpen(true);
        },
      }),
      ...(extraExtensions ?? []),
    ],
    content: initialJSON ?? value,
    editable,
    immediatelyRender: false,
    // An empty document reports as "" rather than Tiptap's "<p></p>".
    // Those are the same thing to a reader, but not to a form: the editor
    // emits once as it mounts, and writing "<p></p>" over a default of ""
    // marked every brand-new record dirty before the user had typed a
    // character — which made the unsaved-changes prompt fire on a form nobody
    // had touched.
    onUpdate: ({ editor }) =>
      onChange(editor.isEmpty ? "" : editor.getHTML(), editor.getJSON()),
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("editor.svg.insert")}
            title={t("editor.svg.insert")}
            aria-pressed={editor?.isActive("svgBlock") ?? false}
            className={
              editor?.isActive("svgBlock")
                ? "bg-accent text-accent-foreground"
                : ""
            }
            onClick={() => {
              setSvgDraft({ code: "", tab: "code" });
              setSvgOpen(true);
            }}
          >
            <Shapes className="size-4" />
          </Button>
          {renderToolbarExtras?.(editor)}
        </div>
      )}
      <EditorContent editor={editor} />
      <SvgDialog
        open={svgOpen}
        onOpenChange={setSvgOpen}
        initial={svgDraft.code}
        initialTab={svgDraft.tab}
        onSubmit={(code) => {
          // An existing drawing is replaced in place; a new one is inserted
          // where the caret is.
          if (svgDraft.apply) svgDraft.apply(code);
          else editor?.chain().focus().setSvg(code).run();
        }}
      />
    </div>
  );
}

export const RichTextEditor = memo(RichTextEditorBase);
