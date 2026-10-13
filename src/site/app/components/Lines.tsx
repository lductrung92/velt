import { Fragment } from "react";

/**
 * Renders a newline in a config string as the <br /> the markup already had.
 *
 * Two headings on this page break across lines by design. Keeping that break in
 * the text — rather than in the JSX — is what lets an editor change the copy in
 * the console without the line break becoming someone else's problem; a single
 * line typed there simply renders on one line.
 */
export function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
