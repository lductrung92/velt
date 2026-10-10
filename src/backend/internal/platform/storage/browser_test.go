package storage

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func seedLocal(t *testing.T) *Local {
	t.Helper()
	l := NewLocal(t.TempDir())
	ctx := context.Background()
	require.NoError(t, l.Save(ctx, "media/a.txt", strings.NewReader("AAA")))
	require.NoError(t, l.Save(ctx, "media/img/logo.png", strings.NewReader("PNG")))
	require.NoError(t, l.Save(ctx, "media/img/sub/deep.txt", strings.NewReader("DEEP")))
	return l
}

func TestLocalBrowser_List(t *testing.T) {
	l := seedLocal(t)
	ents, err := l.List(context.Background(), "media")
	require.NoError(t, err)
	// one level: file a.txt + dir img
	byName := map[string]Entry{}
	for _, e := range ents {
		byName[e.Name] = e
	}
	require.Contains(t, byName, "a.txt")
	require.Contains(t, byName, "img")
	require.False(t, byName["a.txt"].IsDir)
	require.EqualValues(t, 3, byName["a.txt"].Size)
	require.True(t, byName["img"].IsDir)
	require.Equal(t, "media/a.txt", byName["a.txt"].Path)
	require.Equal(t, "media/img", byName["img"].Path)
}

func TestLocalBrowser_ListRootRejected(t *testing.T) {
	l := seedLocal(t)
	_, err := l.List(context.Background(), "")
	require.ErrorIs(t, err, ErrInvalidPath)
}

func TestLocalBrowser_ListMissingDirIsEmpty(t *testing.T) {
	l := seedLocal(t)
	// a valid prefix that was never written → empty listing, not an error
	// (parity with the S3 driver, which returns no objects for a missing prefix).
	ents, err := l.List(context.Background(), "shared")
	require.NoError(t, err)
	require.Empty(t, ents)
}

func TestLocalBrowser_Stat(t *testing.T) {
	l := seedLocal(t)
	e, err := l.Stat(context.Background(), "media/img/logo.png")
	require.NoError(t, err)
	require.False(t, e.IsDir)
	require.EqualValues(t, 3, e.Size)
	dir, err := l.Stat(context.Background(), "media/img")
	require.NoError(t, err)
	require.True(t, dir.IsDir)
}

func TestLocalBrowser_MkdirExists(t *testing.T) {
	l := seedLocal(t)
	ctx := context.Background()
	ok, err := l.Exists(ctx, "media/new")
	require.NoError(t, err)
	require.False(t, ok)
	require.NoError(t, l.Mkdir(ctx, "media/new"))
	ok, err = l.Exists(ctx, "media/new")
	require.NoError(t, err)
	require.True(t, ok)
}

func TestLocalBrowser_CopyFileAndTree(t *testing.T) {
	l := seedLocal(t)
	ctx := context.Background()
	// file copy
	require.NoError(t, l.Copy(ctx, "media/a.txt", "media/a-copy.txt"))
	rc, err := l.Open(ctx, "media/a-copy.txt")
	require.NoError(t, err)
	b, _ := io.ReadAll(rc)
	_ = rc.Close()
	require.Equal(t, "AAA", string(b))
	// tree copy
	require.NoError(t, l.CopyTree(ctx, "media/img", "media/img2"))
	ok, _ := l.Exists(ctx, "media/img2/logo.png")
	require.True(t, ok)
	ok, _ = l.Exists(ctx, "media/img2/sub/deep.txt")
	require.True(t, ok)
	// original intact
	ok, _ = l.Exists(ctx, "media/img/logo.png")
	require.True(t, ok)
}

func TestLocalBrowser_MoveFileAndTree(t *testing.T) {
	l := seedLocal(t)
	ctx := context.Background()
	// file move
	require.NoError(t, l.Move(ctx, "media/a.txt", "media/moved.txt"))
	ok, _ := l.Exists(ctx, "media/a.txt")
	require.False(t, ok)
	ok, _ = l.Exists(ctx, "media/moved.txt")
	require.True(t, ok)
	// dir move
	require.NoError(t, l.Move(ctx, "media/img", "media/imgX"))
	ok, _ = l.Exists(ctx, "media/img/logo.png")
	require.False(t, ok)
	ok, _ = l.Exists(ctx, "media/imgX/sub/deep.txt")
	require.True(t, ok)
}

func TestLocalBrowser_DeleteTree(t *testing.T) {
	l := seedLocal(t)
	ctx := context.Background()
	require.NoError(t, l.DeleteTree(ctx, "media/img"))
	ok, _ := l.Exists(ctx, "media/img/logo.png")
	require.False(t, ok)
	// sibling untouched
	ok, _ = l.Exists(ctx, "media/a.txt")
	require.True(t, ok)
}

func TestLocalBrowser_TraversalRejected(t *testing.T) {
	l := seedLocal(t)
	ctx := context.Background()
	bad := "media/../../etc/passwd"
	_, err := l.List(ctx, bad)
	require.True(t, errors.Is(err, ErrInvalidPath))
	require.ErrorIs(t, l.Mkdir(ctx, bad), ErrInvalidPath)
	require.ErrorIs(t, l.Copy(ctx, bad, "media/x"), ErrInvalidPath)
	require.ErrorIs(t, l.Copy(ctx, "media/a.txt", bad), ErrInvalidPath)
	require.ErrorIs(t, l.DeleteTree(ctx, bad), ErrInvalidPath)
	_, err = l.Stat(ctx, bad)
	require.ErrorIs(t, err, ErrInvalidPath)
}
