// Package storage abstracts file persistence behind a small interface. The
// foundation ships a local-disk driver; an S3 driver plugs into the same
// interface later (driver chosen via the settings registry). Keys/paths follow
// docs/domains/files/overview.md: <entity>/{owner_uuid}/<purpose>-<rand>.<ext>.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// URLer builds the browser-facing URL for a stored key (the raw storage path is
// never exposed). Modules that only emit asset URLs (auth, admin) depend on
// this narrow interface rather than the full Storage.
type URLer interface {
	URL(ctx context.Context, key string) string
}

// Storage persists and serves files by relative path key.
type Storage interface {
	// Save writes r to the given key, creating parent directories as needed.
	Save(ctx context.Context, key string, r io.Reader) error
	// Open returns a reader for the stored file at path.
	Open(ctx context.Context, path string) (io.ReadCloser, error)
	// Delete removes the stored file (no error if it is already absent).
	Delete(ctx context.Context, path string) error
	URLer
}

// ErrInvalidPath is returned for keys/paths that escape the storage root.
var ErrInvalidPath = errors.New("invalid storage path")

// validateKey rejects keys that could escape the storage root: empty, null byte,
// absolute, or containing a ".." segment (after normalizing backslashes). Shared
// by every driver so the ErrInvalidPath guarantee holds regardless of backend —
// in particular the S3 driver, where the object store would otherwise normalize
// "../" and let a key escape its intended prefix (cross-tenant write).
func validateKey(key string) error {
	if key == "" || strings.ContainsRune(key, 0) {
		return ErrInvalidPath
	}
	norm := strings.ReplaceAll(key, "\\", "/")
	if strings.HasPrefix(norm, "/") {
		return ErrInvalidPath
	}
	for _, seg := range strings.Split(norm, "/") {
		if seg == ".." {
			return ErrInvalidPath
		}
	}
	return nil
}

// Local is a filesystem-backed Storage rooted at Root.
type Local struct {
	root string
}

// NewLocal builds a local-disk storage rooted at root (e.g. ./storage).
func NewLocal(root string) *Local { return &Local{root: root} }

// resolve validates a relative key and joins it under the root, rejecting any
// traversal (.. segments, absolute paths, null bytes) — defense against path
// traversal. A final within-root check is the belt-and-suspenders guard.
func (l *Local) resolve(key string) (string, error) {
	if err := validateKey(key); err != nil {
		return "", err
	}
	norm := strings.ReplaceAll(key, "\\", "/")
	full := filepath.Join(l.root, filepath.FromSlash(path.Clean(norm)))
	rootAbs, err := filepath.Abs(l.root)
	if err != nil {
		return "", fmt.Errorf("resolve root: %w", err)
	}
	fullAbs, err := filepath.Abs(full)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}
	if fullAbs != rootAbs && !strings.HasPrefix(fullAbs, rootAbs+string(os.PathSeparator)) {
		return "", ErrInvalidPath
	}
	return fullAbs, nil
}

// Save implements Storage.
func (l *Local) Save(_ context.Context, key string, r io.Reader) error {
	full, err := l.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	f, err := os.OpenFile(full, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o640)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer func() { _ = f.Close() }()
	if _, err := io.Copy(f, r); err != nil {
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}

// Open implements Storage.
func (l *Local) Open(_ context.Context, p string) (io.ReadCloser, error) {
	full, err := l.resolve(p)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(full)
	if err != nil {
		return nil, err
	}
	return f, nil
}

// Delete implements Storage.
func (l *Local) Delete(_ context.Context, p string) error {
	full, err := l.resolve(p)
	if err != nil {
		return err
	}
	if err := os.Remove(full); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete file: %w", err)
	}
	return nil
}

// URL implements Storage: local files are served by the files module at
// /api/files/<key>.
func (l *Local) URL(_ context.Context, key string) string {
	if key == "" {
		return ""
	}
	return "/api/files/" + key
}

var _ Storage = (*Local)(nil)
