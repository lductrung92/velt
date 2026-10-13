import type { Config, CustomFieldRender } from "@puckeditor/core";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { SectionConfig } from "../../services/landing.service";
import { defaultSectionConfig, SECTION_FORMS } from "../landingSections/forms";
import { BUILDER_SECTION_TYPES } from "../landingSections/types";
import { SECTION_PREVIEWS } from "./sectionPreviews";

type TFn = (k: string) => string;

// buildLandingPuckConfig registers every section type as a Puck component. Each
// component:
//   • renders a real in-canvas visual preview (SECTION_PREVIEWS, mirroring the
//     public web renderers) — Puck's native "edit what you see" model;
//   • edits via two custom fields — `visible` (an app Switch → the section's
//     is_visible column) and `cfg` (which mounts the existing classic section
//     form SECTION_FORMS). Reusing the app's own forms gives Puck's right panel
//     the app's themed inputs/uploads/rich-text for free (full parity, no
//     re-declaration, no version-fragile CSS on Puck's default fields).
// The section config is stored nested under `cfg`; `id` is the backend section
// id, reused so a save can reconcile create/update/delete/reorder (see adapter).
export function buildLandingPuckConfig(t: TFn, landingId: string): Config {
  const label = (type: string) => t(`cms.landings.section.${type}`);
  const components: Config["components"] = {};

  const renderVisible: CustomFieldRender<boolean> = ({
    value,
    onChange,
    id,
  }) => (
    <div className="flex items-center gap-2">
      <Switch
        id={`vis-${id}`}
        checked={value !== false}
        onCheckedChange={onChange}
      />
      <Label htmlFor={`vis-${id}`} className="text-sm">
        {t("cms.landings.builder.visible")}
      </Label>
    </div>
  );

  // Full-width: the section spans the band (no max-w-7xl content cap on the web).
  // Stored in config.full_width via the adapter; a plain boolean, so it survives
  // sanitize/snapshot untouched.
  const renderFullWidth: CustomFieldRender<boolean> = ({
    value,
    onChange,
    id,
  }) => (
    <div className="flex items-center gap-2">
      <Switch
        id={`fw-${id}`}
        checked={value === true}
        onCheckedChange={onChange}
      />
      <Label htmlFor={`fw-${id}`} className="text-sm">
        {t("cms.landings.builder.full_width")}
      </Label>
    </div>
  );

  for (const type of BUILDER_SECTION_TYPES) {
    const Form = SECTION_FORMS[type];
    const Preview = SECTION_PREVIEWS[type];
    const renderField: CustomFieldRender<SectionConfig> = ({
      value,
      onChange,
    }) => (
      <Form value={value ?? {}} onChange={onChange} landingId={landingId} />
    );

    components[type] = {
      label: label(type),
      fields: {
        visible: { type: "custom", render: renderVisible },
        fullWidth: { type: "custom", render: renderFullWidth },
        // one full-form field; Puck renders exactly what renderField returns
        // (no auto label), so the panel is the app's own section form.
        cfg: { type: "custom", render: renderField },
      },
      defaultProps: {
        visible: true,
        fullWidth: false,
        cfg: defaultSectionConfig(type),
      },
      render: ({ visible, cfg }) => {
        const hidden = visible === false;
        return (
          // relative wrapper so a hidden section is dimmed + badged on the canvas
          // without affecting Puck's selection outline (which hugs this box).
          // rounded-lg (0.5rem) + overflow-hidden gives each block card-like
          // corners on the canvas (clips full-bleed section backgrounds).
          <div
            className={`relative overflow-hidden rounded-md ${hidden ? "opacity-50" : ""}`}
          >
            {hidden ? (
              <span className="absolute right-2 top-2 z-10 rounded bg-muted px-1.5 py-0.5 text-caption font-medium uppercase text-muted-foreground">
                {t("cms.landings.builder.hidden")}
              </span>
            ) : null}
            <Preview cfg={(cfg as SectionConfig) ?? {}} />
          </div>
        );
      },
    };
  }

  // root.fields = {} suppresses Puck's default "title" root field (a native,
  // unthemed input we don't use — the page name lives on the CMS page). Puck
  // falls back to its default only when root.fields is absent, so an empty
  // object is the documented way to remove it.
  return { components, root: { fields: {} } };
}
