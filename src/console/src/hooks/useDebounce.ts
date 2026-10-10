import { useEffect, useState } from "react";

// Debounce a fast-changing value (e.g. a search box) before it flows into a
// query key, so we don't fire a request on every keystroke.
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
