import type { ReactNode } from "react";

/**
 * The small slice of Markdown an assistant actually emits in a chat bubble,
 * rendered as React elements.
 *
 * WHY NOT A MARKDOWN LIBRARY
 *   Every one of them produces an HTML string, which means
 *   dangerouslySetInnerHTML, which means the model's output becomes markup.
 *   That output is influenced by whatever a visitor types — ask the assistant
 *   to repeat something and it repeats it — so on a public page that is a
 *   stored-XSS path with extra steps. Returning elements makes the whole class
 *   of bug structurally impossible: there is no point at which a string could
 *   be parsed as HTML.
 *
 * WHAT IS SUPPORTED
 *   **bold**, *italic*, _italic_, `code`, and heading lines (the # markers are
 *   dropped and the line is emphasised). Newlines are left to CSS, which
 *   already sets white-space: pre-wrap on the bubble.
 *
 * Tables are deliberately NOT supported: a Markdown table is unreadable in a
 * 360px column whatever it is rendered as, so the assistant is told not to use
 * one (see the backend's system prompt) rather than taught to draw it badly.
 */

/** Matches the inline markers, longest first so ** wins over *. */
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let index = 0;
  for (const piece of text.split(INLINE)) {
    if (!piece) continue;
    const key = `${keyPrefix}-${index++}`;
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4)
      out.push(<strong key={key}>{piece.slice(2, -2)}</strong>);
    else if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2)
      out.push(<code key={key}>{piece.slice(1, -1)}</code>);
    else if (piece.startsWith("*") && piece.endsWith("*") && piece.length > 2)
      out.push(<em key={key}>{piece.slice(1, -1)}</em>);
    else if (piece.startsWith("_") && piece.endsWith("_") && piece.length > 2)
      out.push(<em key={key}>{piece.slice(1, -1)}</em>);
    else out.push(piece);
  }
  return out;
}

/**
 * Renders one block of assistant text.
 *
 * Line structure is preserved as plain text plus <br/>: the bubble's pre-wrap
 * already lays newlines out, and emitting real <ul>/<p> here would fight it.
 */
export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        // A heading in a chat bubble is just an emphasised line; the hashes
        // themselves are noise a reader never wants to see.
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        const body = heading ? (
          <strong>{inline(heading[1], `h${i}`)}</strong>
        ) : (
          inline(line, `l${i}`)
        );
        return (
          <span key={i}>
            {body}
            {i < lines.length - 1 ? "\n" : null}
          </span>
        );
      })}
    </>
  );
}
