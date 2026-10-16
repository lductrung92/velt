package media

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// fakeRows is the row half of the store: what Keep deletes before it clears the
// derivatives those rows keyed.
type fakeRows struct {
	byKey    map[string]string // storage key -> sha256
	keys     []string
	prefixes []string
}

func (f *fakeRows) deleteByKey(_ context.Context, key string) ([]string, error) {
	f.keys = append(f.keys, key)
	if sha, ok := f.byKey[key]; ok {
		delete(f.byKey, key)
		return []string{sha}, nil
	}
	return nil, nil
}

func (f *fakeRows) deleteByPrefix(_ context.Context, prefix string) ([]string, error) {
	f.prefixes = append(f.prefixes, prefix)
	var out []string
	for k, sha := range f.byKey {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			out = append(out, sha)
			delete(f.byKey, k)
		}
	}
	return out, nil
}

// seedDerivatives writes the cache branch a served image leaves behind.
func seedDerivatives(t *testing.T, root, sha string, names ...string) []string {
	t.Helper()
	dir := filepath.Join(root, sha[:2])
	require.NoError(t, os.MkdirAll(dir, 0o750))
	paths := make([]string, 0, len(names))
	for _, n := range names {
		p := filepath.Join(dir, n)
		require.NoError(t, os.WriteFile(p, []byte("bytes"), 0o600))
		paths = append(paths, p)
	}
	return paths
}

func TestForgetDropsTheRowAndTheWholeDerivativeBranch(t *testing.T) {
	root := t.TempDir()
	const sha = "ab12cd34"
	mine := seedDerivatives(t, root, sha,
		sha+"-full.webp", sha+"-320.webp", sha+"-1920.jpg")
	// A different asset's branch under the same two-character shard must
	// survive: the shard is shared, the branch is not.
	const other = "abff0000"
	theirs := seedDerivatives(t, root, other, other+"-640.webp")

	rows := &fakeRows{byKey: map[string]string{"cms/articles/a/featured-1.png": sha}}
	k := &Keep{rows: rows, cacheRoot: root}

	require.NoError(t, k.Forget(context.Background(), "cms/articles/a/featured-1.png"))
	require.Equal(t, []string{"cms/articles/a/featured-1.png"}, rows.keys)
	for _, p := range mine {
		require.NoFileExists(t, p)
	}
	for _, p := range theirs {
		require.FileExists(t, p)
	}
}

func TestForgetPrefixClearsEveryAssetUnderAFolder(t *testing.T) {
	root := t.TempDir()
	a := seedDerivatives(t, root, "1111aaaa", "1111aaaa-320.webp")
	b := seedDerivatives(t, root, "2222bbbb", "2222bbbb-960.webp")
	outside := seedDerivatives(t, root, "3333cccc", "3333cccc-320.webp")

	rows := &fakeRows{byKey: map[string]string{
		"cms/articles/a/featured-1.png": "1111aaaa",
		"cms/articles/a/inline-2.png":   "2222bbbb",
		"cms/articles/b/featured-3.png": "3333cccc",
	}}
	k := &Keep{rows: rows, cacheRoot: root}

	require.NoError(t, k.ForgetPrefix(context.Background(), "cms/articles/a/"))
	require.Equal(t, []string{"cms/articles/a/"}, rows.prefixes)
	require.NoFileExists(t, a[0])
	require.NoFileExists(t, b[0])
	require.FileExists(t, outside[0], "another article's cache is untouched")
	require.Contains(t, rows.byKey, "cms/articles/b/featured-3.png")
}

func TestForgetIsSafeWithNothingWired(t *testing.T) {
	// A module with no media wiring deletes bytes exactly as it always did.
	Forget(context.Background(), nil, "cms/articles/a/x.png")
	ForgetPrefix(context.Background(), nil, "cms/articles/a/")
}

func TestEscapeLikeKeepsAPrefixLiteral(t *testing.T) {
	// A prefix is built from an entity id, but a key with a LIKE wildcard in it
	// must still only match itself.
	require.Equal(t, `cms/100\%/`, escapeLike("cms/100%/"))
	require.Equal(t, `a\_b`, escapeLike("a_b"))
}
