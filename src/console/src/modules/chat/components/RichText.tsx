import type { ReactNode } from "react";

/**
 * The small slice of Markdown an assistant emits in a chat bubble, rendered
 * as React elements.
 *
 * A COPY, ON PURPOSE
 *   The public site has the same component at
 *   src/site/app/components/RichText.tsx. Console and site are separate npm
 *   packages with no shared workspace, so there is nowhere to put one copy
 *   without inventing a package for a forty-line file. The two must stay in
 *   step: an operator reading a transcript in the inbox should see exactly
 *   what the visitor saw, or they will answer a question about text that was
 *   never on screen. Change one, change the other.
 *
 * WHY NOT A MARKDOWN LIBRARY
 *   Every one of them produces an HTML string, which means
 *   dangerouslySetInnerHTML, which means the model's output becomes markup.
 *   That output is shaped by whatever a visitor typed, and here it is being
 *   rendered inside the console — a logged-in, privileged screen. Returning
 *   elements makes the whole class of bug structurally impossible: there is no
 *   point at which a string could be parsed as HTML.
 *
 * WHAT IS SUPPORTED
 *   **bold**, *italic*, _italic_, `code`, and heading lines (the # markers are
 *   dropped and the line is emphasised). Newlines are left to CSS;
 *   .chat-message-bubble already sets white-space: pre-wrap.
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
 * Line structure is preserved as plain text plus the newline itself: the
 * bubble's pre-wrap already lays newlines out, and emitting real <ul>/<p>
 * here would fight it.
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
