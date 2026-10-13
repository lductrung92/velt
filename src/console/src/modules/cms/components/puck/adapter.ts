import type { Data } from "@puckeditor/core";

import { landingService } from "../../services/landing.service";
import type {
  LandingDetail,
  LandingSection,
  SectionConfig,
  SectionType,
} from "../../services/landing.service";

// Puck ↔ Velt landing-section bridge. The landing model stays the canonical
// store: an ordered list of typed sections ({type, config, is_visible}). Puck is
// only the editing surface — each section is a Puck component instance whose
// props are { cfg: <section config>, visible: <is_visible>, id: <section id> }.
// The config is nested under `cfg` (not spread flat) because each Puck component
// edits it through a single custom field bound to that one prop (see puckConfig);
// `visible` is a sibling custom field mapped to the is_visible column. `id` is
// reused from the backend section id so a round-trip can reconcile create/update/
// delete/reorder. All 19 section types round-trip.

type PuckItem = {
  type: string;
  props: {
    cfg?: SectionConfig;
    visible?: boolean;
    fullWidth?: boolean;
    id: string;
  };
};

// sectionsToPuckData maps the landing's ordered sections into Puck content.
// `fullWidth` mirrors config.full_width (stored in the config JSON, not a column).
export function sectionsToPuckData(sections: LandingSection[]): Data {
  const content = sections.map((s) => ({
    type: s.type,
    props: {
      cfg: { ...s.config },
      visible: s.is_visible,
      fullWidth: s.config.full_width === true,
      id: s.id,
    },
  }));
  return { content, root: { props: {} } } as unknown as Data;
}

// puckItemToConfig unwraps the nested section config from a Puck item's props.
function puckItemToConfig(props: { cfg?: SectionConfig }): SectionConfig {
  return { ...(props.cfg ?? {}) };
}

// ── Deferred image uploads ──────────────────────────────────────────────────
// ImageField defers uploads: picking + applying an image stores only a preview
// data URL under `<pathKey>__pending` (a plain string, so it survives Puck's
// JSON history). The real upload happens here, on Save — every pending marker is
// uploaded to the landing media endpoint and replaced with its resolved
// *_path/*_url, then the marker is dropped so the persisted config is clean.
const PENDING_SUFFIX = "__pending";

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
  return new File([blob], `upload.${ext}`, { type: blob.type });
}

// walkResolve recurses a config tree (objects + arrays), uploading any pending
// image markers in place. Nested images (slider slides, gallery/logo items,
// testimonial avatars, …) are all reached this way.
async function walkResolve(node: unknown, landingId: string): Promise<void> {
  if (Array.isArray(node)) {
    for (const child of node) await walkResolve(child, landingId);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.endsWith(PENDING_SUFFIX)) {
      const pending = obj[key] as { dataUrl?: string } | null;
      if (pending?.dataUrl) {
        const file = await dataUrlToFile(pending.dataUrl);
        const res = await landingService.uploadMedia(landingId, file);
        const pathKey = key.slice(0, -PENDING_SUFFIX.length); // e.g. image_path
        obj[pathKey] = res.path;
        obj[pathKey.replace(/_path$/, "_url")] = res.url;
      }
      delete obj[key];
    } else {
      await walkResolve(obj[key], landingId);
    }
  }
}

// resolvePendingImages uploads all deferred images in the editor data and
// returns a clean copy safe to persist (pending markers removed). Call before
// syncSections on Save.
export async function resolvePendingImages(
  landingId: string,
  data: Data,
): Promise<Data> {
  const clone = JSON.parse(JSON.stringify(data)) as Data;
  for (const item of (clone.content ?? []) as unknown as PuckItem[]) {
    await walkResolve(item.props, landingId);
  }
  return clone;
}

// visibleOf reads the visibility prop, defaulting to true (a section with no
// explicit flag — e.g. older data — is shown).
function visibleOf(props: { visible?: boolean }): boolean {
  return props.visible !== false;
}

// syncSections reconciles the landing's stored sections to the Puck editor's
// end-state via the existing section CRUD API (backend still validates + sanitizes
// every config per type — security unchanged):
//   • item id ∈ existing  → updateSection(config, is_visible)
//   • item id ∉ existing  → createSection(type, config, is_visible)  (Puck id)
//   • existing id absent   → deleteSection
//   • final order          → reorderSections(resulting ids in Puck order)
// Returns the refreshed detail.
export async function syncSections(
  detail: LandingDetail,
  data: Data,
): Promise<LandingDetail> {
  const items = (data.content ?? []) as unknown as PuckItem[];
  const existingIds = new Set(detail.sections.map((s) => s.id));
  const keptIds = new Set<string>();

  // create/update, tracking the resulting id in Puck order.
  const orderedIds: string[] = [];
  for (const item of items) {
    const config = puckItemToConfig(item.props);
    // Persist the full-width toggle into the config JSON (kept in sync with the
    // separate Puck prop so the stored config is the source of truth).
    if (item.props.fullWidth) config.full_width = true;
    else delete config.full_width;
    const is_visible = visibleOf(item.props);
    if (existingIds.has(item.props.id)) {
      keptIds.add(item.props.id);
      await landingService.updateSection(item.props.id, { config, is_visible });
      orderedIds.push(item.props.id);
    } else {
      const d = await landingService.createSection(detail.id, {
        type: item.type as SectionType,
        config,
        is_visible,
      });
      // The just-created section is the last one appended by the backend.
      const created = d.sections[d.sections.length - 1];
      keptIds.add(created.id);
      orderedIds.push(created.id);
    }
  }

  // delete sections removed in the editor.
  for (const s of detail.sections) {
    if (!keptIds.has(s.id)) await landingService.deleteSection(s.id);
  }

  // apply the editor's order.
  await landingService.reorderSections(detail.id, orderedIds);
  return landingService.get(detail.id);
}
