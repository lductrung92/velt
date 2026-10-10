import * as React from "react";

import { Input } from "@/components/ui/input";

// Text field for human-language input (e.g. Vietnamese names). Thin wrapper over
// <Input> that stays IME-safe: it does NOT transform the value on change, so
// composition (dấu tiếng Việt) isn't broken (docs/styles/console/input §1).
// Use this — not a bare <Input> — for free-text the user types in their language.
export const TextField = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>((props, ref) => <Input ref={ref} type="text" {...props} />);
TextField.displayName = "TextField";
