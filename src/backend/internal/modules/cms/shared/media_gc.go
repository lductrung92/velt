package shared

import (
	"context"
	"strings"

	"github.com/velt/backend/internal/platform/storage"
)

// treeDeleter is the optional recursive-delete capability the production storage
// Manager implements (via the Browser interface). A minimal test stub may not,
// so callers degrade to a no-op rather than fail.
type treeDeleter interface {
	DeleteTree(ctx context.Context, prefix string) error
}

// PurgeMediaTree best-effort deletes every object under prefix — used when an
// entity (and, where applicable, its published snapshot) is removed, so its whole
// media folder (e.g. "cms/articles/<id>/") is reclaimed instead of leaking.
// No-op when the store lacks recursive delete. Returns any delete error to log.
func PurgeMediaTree(ctx context.Context, files storage.Storage, prefix string) error {
	td, ok := files.(treeDeleter)
	if !ok {
		return nil
	}
	return td.DeleteTree(ctx, prefix)
}

// OwnsMedia reports whether path is empty or lives under the entity's own media
// prefix (e.g. "cms/articles/<id>/"). Client-supplied *_path values are checked
// with this before they are persisted or deleted, so one entity can never point
// at — or delete — another entity's (or a private customer's) storage object.
func OwnsMedia(prefix, path string) bool {
	return path == "" || strings.HasPrefix(path, prefix)
}

// DeleteOldMedia best-effort removes oldPath when an image was replaced or
// cleared — i.e. oldPath is non-empty and differs from newPath. Safe to call on
// every update; it does nothing when the path is unchanged. Only use this where
// the old file is not referenced elsewhere (e.g. a frozen published snapshot).
// prefix scopes the delete to the entity's own media folder (defense-in-depth: a
// stored path outside it is left untouched, so a spoofed *_path can't nuke
// another entity's files).
func DeleteOldMedia(ctx context.Context, files storage.Storage, prefix string, oldPath, newPath *string) {
	o, n := deref(oldPath), deref(newPath)
	if o == "" || o == n || !strings.HasPrefix(o, prefix) {
		return
	}
	_ = files.Delete(ctx, o)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
