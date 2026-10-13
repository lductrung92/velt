import { useSite } from "../context";
import { SectionRenderer } from "../components/SectionRenderer";
import { DEFAULT_HOME_SECTIONS } from "../lib/sections";

/**
 * The home page is a landing page.
 *
 * It renders whatever sections the console publishes for it, in the order the
 * console put them in. With nothing published it falls back to
 * DEFAULT_HOME_SECTIONS — the same eight sections in the same order the page
 * has always shipped — so the page looks identical before anyone touches the
 * builder, and there is exactly ONE code path either way. Two paths would be
 * two layouts to keep in step, and they would drift.
 */
export function Home() {
  const { sections } = useSite();
  return (
    <SectionRenderer
      sections={sections?.length ? sections : DEFAULT_HOME_SECTIONS}
    />
  );
}
