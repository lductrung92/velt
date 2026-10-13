package articles

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionCreated     = "article.created"
	actionUpdated     = "article.updated"
	actionPublished   = "article.published"
	actionUnpublished = "article.unpublished"
	actionDeleted     = "article.deleted"
)

// articleEntry builds an entry pointed at an article, labelled with the title
// as it was at that moment; meta may be nil.
func articleEntry(action string, articleID uuid.UUID, title string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: EntityArticle, EntityID: &articleID,
		EntityLabel: title, Metadata: meta,
	}
}

// updateAction names what an edit did to the article's publication state.
// Going public and coming back off it are the two moves people search the log
// for, so they are their own codes rather than an "updated" row whose metadata
// the reader has to decode. Every other transition is part of authoring.
func updateAction(from, to string) string {
	switch {
	case to == ArticleStatusPublished && from != ArticleStatusPublished:
		return actionPublished
	case from == ArticleStatusPublished && to != ArticleStatusPublished:
		return actionUnpublished
	default:
		return actionUpdated
	}
}

// statusMeta records a status move, and nothing at all when there was none.
func statusMeta(from, to string) map[string]any {
	if from == to {
		return nil
	}
	return map[string]any{"from": from, "to": to}
}
