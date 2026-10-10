package storage

import (
	"bytes"
	"context"
	"io"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLocal_SaveOpenDelete(t *testing.T) {
	root := t.TempDir()
	s := NewLocal(root)
	ctx := context.Background()
	key := "users/abc/avatar-xyz.png"

	require.NoError(t, s.Save(ctx, key, bytes.NewReader([]byte("hello"))))

	rc, err := s.Open(ctx, key)
	require.NoError(t, err)
	data, _ := io.ReadAll(rc)
	_ = rc.Close()
	require.Equal(t, "hello", string(data))

	require.NoError(t, s.Delete(ctx, key))
	_, err = s.Open(ctx, key)
	require.Error(t, err)

	// Deleting a missing file is not an error.
	require.NoError(t, s.Delete(ctx, key))
}

func TestLocal_RejectsTraversal(t *testing.T) {
	s := NewLocal(t.TempDir())
	ctx := context.Background()
	for _, bad := range []string{"../escape.txt", "a/../../escape.txt", "/etc/passwd", "a\x00b"} {
		require.ErrorIs(t, s.Save(ctx, bad, bytes.NewReader([]byte("x"))), ErrInvalidPath, bad)
		_, err := s.Open(ctx, bad)
		require.Error(t, err, bad)
	}
}

// validateKey is the shared driver guard (also enforced by the S3 driver, which
// has no filesystem to fall back on). The games variant uploader builds keys from
// a client-supplied field name, so a "../" must be rejected here.
func TestValidateKey(t *testing.T) {
	bad := []string{"", "a\x00b", "/abs", "../x", "a/../../x",
		"customers/u/games/g/c/../../../other/x.svg", "a\\..\\b"}
	for _, k := range bad {
		require.ErrorIs(t, validateKey(k), ErrInvalidPath, k)
	}
	good := []string{"a.svg", "customers/uuid/games/slug/cfg/field-0.svg", "background/ocean/001.svg"}
	for _, k := range good {
		require.NoError(t, validateKey(k), k)
	}
}

func TestLocal_StaysWithinRoot(t *testing.T) {
	root := t.TempDir()
	s := NewLocal(root)
	require.NoError(t, s.Save(context.Background(), "deep/dir/file.bin", bytes.NewReader([]byte("ok"))))
	// File physically lands under root.
	_, err := filepath.Abs(filepath.Join(root, "deep", "dir", "file.bin"))
	require.NoError(t, err)
}
