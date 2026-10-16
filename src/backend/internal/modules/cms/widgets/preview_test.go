package widgets

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

func newPreviewService() *PreviewService {
	// nil ports → list widgets resolve to empty items; nil settings is fine
	// because Preview never reads feature flags.
	return NewPreviewService(shared.NewBase(nil, nil), NewResolver(Ports{}))
}

func idWith(perms ...string) *httpx.Identity {
	return &httpx.Identity{Permissions: perms}
}

func TestPreview_RequiresPermission(t *testing.T) {
	s := newPreviewService()
	_, err := s.Preview(context.Background(), idWith(), TypeArticlesList, json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected permission denied without cms.page.view")
	}
}

func TestPreview_UnknownTypeRejected(t *testing.T) {
	s := newPreviewService()
	_, err := s.Preview(context.Background(), idWith(permPageView), "nope", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected validation error for unknown widget type")
	}
}

func TestPreview_ResolvesKnownType(t *testing.T) {
	s := newPreviewService()
	res, err := s.Preview(context.Background(), idWith(permPageView), TypeArticlesList, json.RawMessage(`{"limit":4}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Type != TypeArticlesList {
		t.Fatalf("type = %q, want %q", res.Type, TypeArticlesList)
	}
	// nil Articles port → resolver returns {"items": []}
	m, ok := res.Data.(map[string]any)
	if !ok {
		t.Fatalf("data = %T, want map", res.Data)
	}
	if _, ok := m["items"]; !ok {
		t.Fatalf("data missing items key: %v", m)
	}
}

func TestPreview_StaticTypeNilData(t *testing.T) {
	s := newPreviewService()
	res, err := s.Preview(context.Background(), idWith(permPageView), TypeRichText, json.RawMessage(`{"html":"<p>hi</p>"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Data != nil {
		t.Fatalf("static widget data = %v, want nil", res.Data)
	}
}
