import { html } from "@codemirror/lang-html";
import CodeMirror from "@uiw/react-codemirror";

// IDE-like HTML editor (CodeMirror 6): line numbers, syntax highlighting (HTML +
// embedded CSS/JS via lang-html), auto-close tags, bracket matching, code
// folding and autocompletion come from CodeMirror's default basicSetup. Lazy-
// loaded by CodeField so the ~CodeMirror bundle only downloads when an HTML embed
// section is actually edited.
export default function CodeMirrorEditor({
  value,
  onChange,
  dark,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  dark: boolean;
  ariaLabel?: string;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[html()]}
      theme={dark ? "dark" : "light"}
      height="288px"
      aria-label={ariaLabel}
      style={{ fontSize: 13 }}
    />
  );
}
