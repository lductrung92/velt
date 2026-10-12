# Console typography

The console uses Inter and Tailwind's rem-based type scale. Shared sizes live in
`src/console/src/index.css`; Tailwind utilities reference these same tokens in
`src/console/tailwind.config.ts`.

| Purpose | Utility | CSS token | Size at a 16px root |
| --- | --- | --- | --- |
| Tiny graphic-adjacent details, lunar calendar subdate | `text-caption` | `--font-size-caption` | 11px |
| Secondary information, badges, table headings | `text-xs` | `--font-size-xs` | 12px |
| Code editor | `text-compact` | `--font-size-compact` | 13px |
| Body text, record names, chat messages, tabs and form controls | `text-sm` | `--font-size-sm` | 14px |
| Standard body text | `text-base` | `--font-size-base` | 16px |
| Section heading | `text-lg` | `--font-size-lg` | 18px |
| Page heading | `text-2xl` | `--font-size-2xl` | 24px |
| Overview number | `text-4xl` | `--font-size-4xl` | 36px |

Use utilities in JSX and the shared variables in component CSS. For example:

```tsx
<span className="text-xs text-muted-foreground">Updated today</span>
```

```css
.customer-note {
  font-size: var(--font-size-sm);
}
```

Custom display headings may use rem or a fluid clamp with rem bounds. Keep the
browser's default root font size so text follows the user's preferences. Avoid
hardcoded pixel font sizes and arbitrary `text-[Npx]` classes; supplementary
interface text normally uses at least text-xs. Do not use caption or compact for
primary text just to fit a custom layout. Match roles to existing CMS/admin
screens: 14px body and controls, 12px metadata and table headings at a 16px root.
Keep these roles on phones; wrap controls or adjust layout instead of shrinking
the text. Caption is reserved for unusually small details such as lunar subdates.

SVG/Remotion illustration labels use their viewBox coordinate scale, alongside
the illustration's shapes. Keep these graphical coordinates separate from
interface typography. CMS-authored content is controlled by its author; this
convention covers the console and editor interface.

When changing typography, check both normal and increased root text size, narrow
viewports, tables, filters, forms and chat composers. Verify text remains readable
and controls remain reachable.
