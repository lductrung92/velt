package storage

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeSettings struct{ m map[string]string }

func (f fakeSettings) GetString(_ context.Context, k string) string { return f.m[k] }
func (f fakeSettings) GetSecret(_ context.Context, k string) string { return f.m[k] }

func TestManagerURL_LocalDriver(t *testing.T) {
	m := NewManager(NewLocal(t.TempDir()), fakeSettings{m: map[string]string{"storage.driver": "local"}})
	require.Equal(t, "/api/files/users/1/a.jpg", m.URL(context.Background(), "users/1/a.jpg"))
	require.Equal(t, "", m.URL(context.Background(), ""))
}

func TestManagerURL_S3Driver(t *testing.T) {
	m := NewManager(NewLocal(t.TempDir()), fakeSettings{m: map[string]string{
		"storage.driver":      "s3",
		"storage.s3_endpoint": "https://cdn.example.com/", // trailing slash trimmed
		"storage.s3_bucket":   "velt",
	}})
	// Public URL omits the bucket (implicit in the cdn endpoint; the vhost
	// rewrites the short path back to path-style before hitting SeaweedFS).
	require.Equal(t, "https://cdn.example.com/users/1/a.jpg",
		m.URL(context.Background(), "users/1/a.jpg"))
}

func TestManagerURL_S3MisconfiguredFallsBackToLocal(t *testing.T) {
	// driver=s3 but endpoint/bucket missing → fall back to local serving so the
	// URL is never broken.
	m := NewManager(NewLocal(t.TempDir()), fakeSettings{m: map[string]string{"storage.driver": "s3"}})
	require.Equal(t, "/api/files/x.jpg", m.URL(context.Background(), "x.jpg"))
}

func TestManager_LocalSaveOpenDeleteDelegates(t *testing.T) {
	ctx := context.Background()
	m := NewManager(NewLocal(t.TempDir()), fakeSettings{m: map[string]string{"storage.driver": "local"}})
	require.NoError(t, m.Save(ctx, "users/1/a.txt", strings.NewReader("hi")))
	rc, err := m.Open(ctx, "users/1/a.txt")
	require.NoError(t, err)
	b, _ := io.ReadAll(rc)
	_ = rc.Close()
	require.Equal(t, "hi", string(b))
	require.NoError(t, m.Delete(ctx, "users/1/a.txt"))
}

func TestS3_URLAndConfigValidation(t *testing.T) {
	s3, err := NewS3(S3Config{Endpoint: "http://127.0.0.1:8333", Bucket: "velt", AccessKey: "k", Secret: "s"})
	require.NoError(t, err)
	require.Equal(t, "http://127.0.0.1:8333/users/1/a.jpg",
		s3.URL(context.Background(), "users/1/a.jpg"))

	_, err = NewS3(S3Config{Endpoint: "", Bucket: "b"})
	require.Error(t, err) // endpoint required
}
