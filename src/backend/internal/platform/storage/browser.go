package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

// Entry is one item at a single directory level (a file or a "folder").
type Entry struct {
	Name    string    `json:"name"` // last segment, e.g. "avatar.png" / "img"
	Path    string    `json:"path"` // full relative key, e.g. "media/img/logo.png" (folders: no trailing slash)
	IsDir   bool      `json:"is_dir"`
	Size    int64     `json:"size"` // 0 for folders
	ModTime time.Time `json:"mtime"`
}

// Browser is the directory-level surface the file manager needs, layered on top
// of Storage. Both drivers (Local, S3) implement it; the Manager delegates to the
// active driver. validateKey guards every key/prefix (no traversal), same as
// Storage. List operates on ONE level (not recursive); the *Tree ops recurse.
type Browser interface {
	List(ctx context.Context, prefix string) ([]Entry, error)
	Stat(ctx context.Context, key string) (Entry, error)
	Mkdir(ctx context.Context, prefix string) error
	Copy(ctx context.Context, src, dst string) error
	CopyTree(ctx context.Context, srcPrefix, dstPrefix string) error
	Move(ctx context.Context, src, dst string) error
	DeleteTree(ctx context.Context, prefix string) error
	Exists(ctx context.Context, key string) (bool, error)
}

// dirPrefix normalises a directory key to a single trailing slash ("media/img" →
// "media/img/"); "" stays "" (caller must not pass the bucket root).
func dirPrefix(p string) string {
	p = strings.Trim(strings.ReplaceAll(p, "\\", "/"), "/")
	if p == "" {
		return ""
	}
	return p + "/"
}

// lastSegment returns the final path element of a key ("a/b/c.png" → "c.png",
// "a/b/" → "b").
func lastSegment(key string) string {
	return path.Base(strings.TrimSuffix(strings.ReplaceAll(key, "\\", "/"), "/"))
}

// ---- Local driver ----

// List implements Browser — one directory level under prefix.
func (l *Local) List(_ context.Context, prefix string) ([]Entry, error) {
	norm := strings.Trim(strings.ReplaceAll(prefix, "\\", "/"), "/")
	if norm == "" {
		return nil, ErrInvalidPath // bucket root is synthesised by the service (zones), not listed here
	}
	full, err := l.resolve(norm)
	if err != nil {
		return nil, err
	}
	des, err := os.ReadDir(full)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Entry{}, nil // parity with S3: a never-used directory is simply empty
		}
		return nil, err
	}
	out := make([]Entry, 0, len(des))
	for _, de := range des {
		info, ierr := de.Info()
		if ierr != nil {
			continue
		}
		e := Entry{Name: de.Name(), Path: norm + "/" + de.Name(), IsDir: de.IsDir(), ModTime: info.ModTime()}
		if !de.IsDir() {
			e.Size = info.Size()
		}
		out = append(out, e)
	}
	return out, nil
}

// Stat implements Browser (file or dir).
func (l *Local) Stat(_ context.Context, key string) (Entry, error) {
	full, err := l.resolve(key)
	if err != nil {
		return Entry{}, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return Entry{}, err
	}
	e := Entry{Name: lastSegment(key), Path: strings.Trim(key, "/"), IsDir: info.IsDir(), ModTime: info.ModTime()}
	if !info.IsDir() {
		e.Size = info.Size()
	}
	return e, nil
}

// Mkdir implements Browser.
func (l *Local) Mkdir(_ context.Context, prefix string) error {
	norm := strings.Trim(strings.ReplaceAll(prefix, "\\", "/"), "/")
	full, err := l.resolve(norm)
	if err != nil {
		return err
	}
	return os.MkdirAll(full, 0o750)
}

// Copy implements Browser (single file).
func (l *Local) Copy(ctx context.Context, src, dst string) error {
	rc, err := l.Open(ctx, src)
	if err != nil {
		return err
	}
	defer func() { _ = rc.Close() }()
	return l.Save(ctx, dst, rc)
}

// CopyTree implements Browser — recursive copy of a directory subtree.
func (l *Local) CopyTree(ctx context.Context, srcPrefix, dstPrefix string) error {
	src := strings.Trim(strings.ReplaceAll(srcPrefix, "\\", "/"), "/")
	dst := strings.Trim(strings.ReplaceAll(dstPrefix, "\\", "/"), "/")
	srcFull, err := l.resolve(src)
	if err != nil {
		return err
	}
	if _, err := l.resolve(dst); err != nil {
		return err
	}
	return filepath.Walk(srcFull, func(p string, info os.FileInfo, werr error) error {
		if werr != nil {
			return werr
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(srcFull, p)
		if err != nil {
			return err
		}
		dstKey := dst + "/" + filepath.ToSlash(rel)
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer func() { _ = f.Close() }()
		return l.Save(ctx, dstKey, f)
	})
}

// Move implements Browser (file or dir) — rename, fallback copy+delete.
func (l *Local) Move(ctx context.Context, src, dst string) error {
	srcFull, err := l.resolve(src)
	if err != nil {
		return err
	}
	dstFull, err := l.resolve(dst)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstFull), 0o750); err != nil {
		return err
	}
	if err := os.Rename(srcFull, dstFull); err == nil {
		return nil
	}
	// Cross-device or dir fallback: copy subtree then remove.
	info, serr := os.Stat(srcFull)
	if serr != nil {
		return serr
	}
	if info.IsDir() {
		if err := l.CopyTree(ctx, src, dst); err != nil {
			return err
		}
	} else if err := l.Copy(ctx, src, dst); err != nil {
		return err
	}
	return l.DeleteTree(ctx, src)
}

// DeleteTree implements Browser — recursive delete.
func (l *Local) DeleteTree(_ context.Context, prefix string) error {
	full, err := l.resolve(prefix)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(full); err != nil {
		return fmt.Errorf("delete tree: %w", err)
	}
	return nil
}

// Exists implements Browser.
func (l *Local) Exists(_ context.Context, key string) (bool, error) {
	full, err := l.resolve(key)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(full)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

var _ Browser = (*Local)(nil)
