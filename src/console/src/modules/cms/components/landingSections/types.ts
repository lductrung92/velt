import { SECTION_TYPES } from "../../services/landing.service";
import type { SectionType } from "../../services/landing.service";

// The five sections the public home page is built from. They are declared here,
// next to their forms, so forms / previews / the Puck registry all iterate one
// ordered list.
export const HOME_SECTION_TYPES = [
  "audience_picker",
  "product_grid",
  "team",
  "buying_steps",
  "contact_form",
] as const;

// Everything the landing designer can place: the service's section types plus
// the home-page ones.
export const BUILDER_SECTION_TYPES = [
  ...SECTION_TYPES,
  ...HOME_SECTION_TYPES,
] as const;

export type BuilderSectionType =
  | SectionType
  | (typeof HOME_SECTION_TYPES)[number];
