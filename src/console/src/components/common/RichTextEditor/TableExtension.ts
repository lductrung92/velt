import { mergeAttributes } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";

/**
 * A table that comes back out of the editor the way the server stores it.
 *
 * Tiptap's own table renders `style="min-width: …"` on the table and a
 * `<colgroup>` of sized `<col>`s. The server's sanitizer drops `style`
 * outright (htmlsan.go), so what the editor emits and what gets stored would
 * never match: every article with a table would report unsaved changes the
 * moment it was opened, which is the trap bug-133 already cost us once.
 *
 * Widths are a stylesheet's job here anyway — the console and the public site
 * each lay their tables out themselves.
 */
const PlainTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]];
  },
});

/** The table nodes the editor mounts, in the order Tiptap expects them. */
export const TableExtensions = [
  PlainTable.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];
