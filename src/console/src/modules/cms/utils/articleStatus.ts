import type { StatusTone } from "@/components/common/StatusBadge";

import type { ArticleStatus } from "../services/articles.service";

// Every editorial status, in workflow order (workflow-states §2).
export const ARTICLE_STATUSES: ArticleStatus[] = [
  "draft",
  "pending_review",
  "needs_revision",
  "scheduled",
  "published",
  "archived",
];

// Status → StatusBadge tone (the shared badge has 4 tones; map the 6 states onto
// them — table-columns §2 hues collapse to success/warning/danger/neutral).
const TONE: Record<ArticleStatus, StatusTone> = {
  draft: "neutral",
  pending_review: "warning",
  needs_revision: "danger",
  scheduled: "warning",
  published: "success",
  archived: "neutral",
};

export function statusTone(status: ArticleStatus): StatusTone {
  return TONE[status] ?? "neutral";
}

// Mirrors backend isReviewerRole (service_articles.go): admin/super_admin author
// → reviewer-class, which suppresses the review states for their own articles.
export function isReviewerRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

// allowedStatuses mirrors the backend gate (service_articles.go allowedStatuses,
// workflow-states §4): the status set an actor may assign, from actor-class ×
// author-class × the review/scheduling flags. This drives the editor's status
// <Select>; the backend re-enforces it (out-of-set → 422 invalid_status_transition).
export function allowedStatuses(opts: {
  actorIsReviewer: boolean;
  authorIsReviewer: boolean;
  isCreate: boolean;
  reviewOn: boolean;
  schedulingOn: boolean;
}): ArticleStatus[] {
  const {
    actorIsReviewer,
    authorIsReviewer,
    isCreate,
    reviewOn,
    schedulingOn,
  } = opts;
  const base: ArticleStatus[] = ["draft", "archived", "published"];
  if (schedulingOn) base.push("scheduled");

  if (!actorIsReviewer) {
    // Editor, on their own article.
    if (reviewOn) return ["draft", "archived", "pending_review"];
    return base; // review OFF → editor == everyone
  }
  // Reviewer (admin / super_admin).
  if (isCreate) return base; // admins never create straight into review states
  if (reviewOn && !authorIsReviewer) {
    return [...base, "pending_review", "needs_revision"];
  }
  return base;
}
