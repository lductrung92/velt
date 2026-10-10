package articles

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// pngBytes is a buffer that magic-byte-sniffs as PNG.
func pngBytes(n int) []byte {
	sig := []byte("\x89PNG\r\n\x1a\n")
	if n <= len(sig) {
		return sig
	}
	return append(sig, bytes.Repeat([]byte{0}, n-len(sig))...)
}

func TestUploadArticleMedia_Featured(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	a := editorActor(uuid.New())
	art, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài"})
	require.NoError(t, err)

	res, err := e.svc.UploadArticleMedia(context.Background(), a, art.ID, "featured", bytes.NewReader(pngBytes(64)))
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(res.Path, "cms/articles/"+art.ID.String()+"/featured-"))
	require.True(t, strings.HasSuffix(res.Path, ".png"))
	require.Equal(t, "https://cdn.test/"+res.Path, res.URL)
	_, ok := e.store.Saved[res.Path]
	require.True(t, ok, "expected the image to be saved under its key")
}

func TestUploadArticleMedia_RejectNonImage(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	a := editorActor(uuid.New())
	art, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài"})
	require.NoError(t, err)

	_, err = e.svc.UploadArticleMedia(context.Background(), a, art.ID, "featured",
		strings.NewReader("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))
	cmstest.AssertAppErr(t, err, http.StatusUnsupportedMediaType, "unsupported_media_type")
}

func TestUploadArticleMedia_TooLarge(t *testing.T) {
	e := newTestSvc(t)
	e.settings.MaxUploadMB = 1 // 1 MB cap
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	a := editorActor(uuid.New())
	art, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài"})
	require.NoError(t, err)

	_, err = e.svc.UploadArticleMedia(context.Background(), a, art.ID, "featured",
		bytes.NewReader(pngBytes((1<<20)+10)))
	cmstest.AssertAppErr(t, err, http.StatusRequestEntityTooLarge, "payload_too_large")
}

func TestUploadArticleMedia_InvalidPurpose(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	a := editorActor(uuid.New())
	art, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài"})
	require.NoError(t, err)

	_, err = e.svc.UploadArticleMedia(context.Background(), a, art.ID, "banner", bytes.NewReader(pngBytes(64)))
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestUploadArticleMedia_ABACOtherAuthor(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	owner := editorActor(uuid.New())
	art, err := e.svc.CreateArticle(context.Background(), owner, CreateArticleRequest{Title: "Bài"})
	require.NoError(t, err)

	other := editorActor(uuid.New())
	_, err = e.svc.UploadArticleMedia(context.Background(), other, art.ID, "featured", bytes.NewReader(pngBytes(64)))
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestUploadArticleMedia_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	a := editorActor(uuid.New())
	art, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài"})
	require.NoError(t, err)

	_, err = e.svc.UploadArticleMedia(context.Background(), cmstest.ActorWith(permView), art.ID, "featured",
		bytes.NewReader(pngBytes(64)))
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestUploadArticleMedia_EditorReadOnlyWhenPublished(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false, shared.FlagArticleRequireReview: false})
	a := editorActor(uuid.New())
	pub := ArticleStatusPublished
	art, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài", Status: &pub})
	require.NoError(t, err)

	_, err = e.svc.UploadArticleMedia(context.Background(), a, art.ID, "featured", bytes.NewReader(pngBytes(64)))
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}
